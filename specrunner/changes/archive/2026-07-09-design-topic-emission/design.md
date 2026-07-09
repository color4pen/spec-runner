# Design: 設計層 topic 排出 — archive 時に design-level findings を design/topics/ へ機械排出する

## Context

設計層 CLI（aozu）の交換面契約は、実装工程で出た設計レベルの摩擦（レビューの構造指摘・スコープ外
finding）をパイプラインが topic として設計正本へ機械排出することを定めている。契約の要点:

- 排出対象は「解決が change folder の外——設計正本（`design/`）——への変更を要する finding」。判定は
  呼び出し側（本ツール）の責務で、**過剰排出は許容される**（topic の下流は人が裁く。取りこぼし =
  設計債務の不可視化の方が高くつく）。
- 書式: `design/topics/<slug>.md`。flat frontmatter（ネスト・複数行値なし）で `id: top-<slug>`（必須）と
  `source:`（出所への逆リンク、任意）。本文は症状・動機。暫定裁定を書いてよいが「提案であって決定ではない」。
- slug 文法: `^[a-z0-9]+(-[a-z0-9]+)*$`（小文字英数のハイフン区切り）。
- 冪等: slug は finding の同一性から決定的に導出し、既存ファイルは上書きしない。
- タイミング: 遅くとも取り込み（archive / merge）まで。
- 縮退: designLayer 無効または `design/` 不在では排出しない（no-op）。`design/topics/` が無ければ作成してよい。
- aozu CLI の呼び出しは不要（ファイル契約のみ）。

現状、この種の設計レベル finding（request-review の needs-discussion / spec-review escalation の
decision-needed など）は escalation 出力・issue コメント・decision ledger にしか残らず、設計層の
バックログ（`design/topics/`）には人手でしか届かない。本 change はこの排出を archive フェーズで機械化する。

### 現状コードの前提（統合点）

- archive orchestrator（`src/core/archive/orchestrator.ts`）は Phase 0 で job state を読み込み
  （`JobStateStore.list`）、Phase 1 で recordDir を解決し、draft 削除 → scoped `git add specrunner/changes/`
  （L284）→ design-layer mark-hook（L291-304 で `runDesignLayerMarkHook`）→ `commitArchive`（L307）の順で実行する。
  ただし読み込んだ `state` は Phase 0 の try ブロック内に閉じており、jobId/branch/worktreePath/noWorktree/prNumber
  のみ抽出して破棄している（`state.steps` / `state.decisions` は保持していない）。
- mark-hook（`src/core/design-layer/mark-hook.ts`）は「archive 時に外部書き込みを行い `git add -A -- design` で
  ステージして archive commit に載せる」実装パターンの実例（L60-77）。本 change はこれと同層・同パターンで並べる。
- designLayer 設定は `DesignLayerConfig { enabled?, command?, requireCitationTypes? }`
  （`src/config/schema.ts:464-481`）。`resolveDesignLayerConfig`（schema.ts:1255-1261）が既定値を適用して
  `ResolvedDesignLayer { enabled, command, requireCitationTypes }`（schema.ts:1244-1248）を返す。
- findings の正典型は `Finding { severity, resolution: "fixable" | "decision-needed", file, line?, title,
  rationale, fixTarget?, options?, origin?: "scope" }`（`src/kernel/report-result.ts:40-75`）。各 step run の
  findings は `state.steps[step][].outcome.toolResult.findings` から取得できる（`StepRun.attempt` が 1-origin の
  iteration、`src/state/schema.ts:164-179`）。
- 人の裁定は decision ledger に記録される（`DecisionRecord { step, findingKey, finding, selectedOption, ... }`:
  `src/state/schema.ts:225-242`、`state.decisions`: schema.ts:322）。finding → 裁定の照合は
  `computeFindingKey(step, finding)` / `isFindingDecided`（`src/core/decision/decision-ledger.ts:32-57`）で行える。
- merge 経路（`job archive --with-merge`）は `runMergeThenArchive`（`src/core/archive/merge-then-archive.ts:222`）が
  内部で `runArchiveOrchestrator` を呼ぶ。したがって orchestrator に排出を置けば両経路が自動的に covered される。

## Goals / Non-Goals

**Goals**:

- archive フェーズで、job の全 step run の findings から `resolution: "decision-needed"` **または**
  `origin: "scope"` の finding を収集・dedupe し、1 finding = 1 topic として recordDir の
  `design/topics/<slug>.md` に契約準拠の書式で書き出す。
- slug を finding の同一性から決定的に導出し、既存ファイルは上書きしない（冪等）。
- 書き出したファイルを mark-hook とは独立したステージングで archive commit に載せる。
- `job archive` と `job archive --with-merge` の両経路で排出が走る。
- `designLayer.enabled=false` / 新設定 `topicEmission=false` / `design/` 不在では完全な no-op（既存挙動維持）。

**Non-Goals**:

- 正本テストの完全自動判定（解決コミットのパス解析等）。v1 は decision-needed / origin:"scope" の機械分類で、
  契約が明示的に許容する過剰排出側に倒す。
- escalation 時点でのリアルタイム排出（v1 は archive 時のみ）。
- aozu CLI の呼び出し（契約はファイルのみ）。既存 mark-hook / check-gate の変更も不要。
- 排出済み topic の後続管理（addressed 判定は aozu 側で ADR 引用から計算される）。
- GitHub issue コメント・escalation 出力との重複排除。

## Decisions

### D1: 新 hook モジュールを design-layer 層に新設（archive 時排出）

排出ロジックを `src/core/design-layer/topic-emission.ts` に新設し、mark-hook と同層・同パターンで並べる。
純粋な収集・整形ロジック（候補収集・slug 導出・本文生成）は副作用のない関数として分離し、I/O（fs / git add）を
行うオーケストレーション関数 `emitDesignTopics(params)` を公開する。

- **Rationale**: escalation 時点の finding は後続 iteration で fix され得るため確定は archive 時。archive には
  「外部書き込みを commit に載せる」実証済みパターン（mark-hook）が既にあり、同層に並べるのが構造的に最小。
- **Alternatives considered**: (a) escalation 時排出 — 未確定 finding を排出してしまい、後で fix された finding が
  topic に残る。却下。(b) pipeline step として独立 step 化 — state machine / 遷移テーブルの改変が必要で v1 過剰。却下。

### D2: 排出対象は `resolution: "decision-needed"` OR `origin: "scope"` の機械分類

全 step run の findings を走査し、`f.resolution === "decision-needed" || f.origin === "scope"` を満たす finding を
排出候補とする。

- **Rationale**: fixable はパイプライン内で解決済みでありノイズが過大。契約が過剰排出を許容しているため、
  この 2 条件の機械分類で「設計正本へ返るべき finding」を十分に捕捉できる。
- **Alternatives considered**: (a) 全 finding 排出 — fixable のノイズが過大。却下。(b) 人の明示マーキング —
  新しい UI/ジェスチャーが必要で v1 過剰。却下。

### D3: provenance を保持した収集 + dedupe（既存 findings-ledger は流用しない）

既存の `dedupeFindings`（`src/core/pipeline/findings-ledger.ts`）は (file|line|title) だけを残して step/iteration/index を
落とすため流用しない。本 change 専用に、`{ finding, step, iteration, index }` を保持したまま収集し
(`step|file|line|title`) を dedupe キーとする収集関数を新設する。走査順は決定的（step 名を辞書順、run を
`attempt` 昇順、finding を配列 index 昇順）とし、同一キーは最初の出現を採用する。

- **Rationale**: slug と source が step/iteration/index を要求するため provenance を捨てられない。dedupe キーに step を
  含めるのは slug が step を含む（＝ topic の同一性が step scope）ことと整合し、decision ledger の
  `computeFindingKey`（step を含む）とも一致する。走査順を固定することで re-archive でも同じ finding が同じ slug に落ちる。
- **Alternatives considered**: `dedupeFindings` を provenance 対応に拡張 — regression-gate の意味論（fixable 専用）と
  混ざり、既存利用の回帰リスク。別関数として分離する方が安全。却下。

### D4: slug は `<job-slug>-<step>-<iteration>-<index>` から決定的に正規化

topic slug は生文字列 `<job-slug>-<step>-<iteration>-<index>` を契約文法 `^[a-z0-9]+(-[a-z0-9]+)*$` へ正規化して
導出する（小文字化 → `[a-z0-9]` 以外をハイフンへ → 連続ハイフンを 1 つに畳む → 先頭/末尾ハイフン除去）。
`id` は `top-<slug>`。同一入力からは常に同一 slug（純粋関数）。

- **Rationale**: step 名は既に kebab-case、job-slug も小文字ハイフン、iteration/index は数値なので通常は正規化不要だが、
  正規化を必ず通すことで契約文法を機械的に保証し、想定外の文字が混じっても壊れない。
- **Alternatives considered**: ハッシュ由来 slug — 人が読めず逆リンクの手掛かりにならない。却下。

### D5: topic ファイル書式は flat frontmatter + 症状/文脈/暫定裁定

frontmatter は `id` と `source`（`specrunner:<job-slug>/<step>-<iteration>#<index>`）の 2 キーのみ（flat、複数行値なし）。
本文は finding の title を見出し、rationale を症状として、severity/step/file(:line) を文脈として併記する。
decision ledger に対応する裁定（`isFindingDecided` が真）があれば「暫定裁定（提案であって決定ではない）」の見出しで
選択肢 label / consequence を併記する。

- **Rationale**: 契約が定める最小書式。逆リンク（source）で人が出所を辿れ、暫定裁定は「決定ではない」ことを明示して
  設計層の裁定権を侵さない。
- **Alternatives considered**: options 全列挙や finding JSON 埋め込み — 冗長で人が読む topic の目的に反する。却下。

### D6: 冪等はファイル存在スキップで担保

書き出し先 `design/topics/<slug>.md` が既に存在すれば上書きせず skip する。slug が決定的なので、再 archive・
既存同名ファイル・（理論上の）slug 衝突のいずれでも重複ファイル・重複 ID を作らない。stdout の件数は
「新規に書き出した」ファイル数を数える。

- **Rationale**: 契約の「既存ファイルは上書きしない」を最小コストで満たす。既存 topic に人が加筆していても保護される。

### D7: mark-hook から独立したステージング、orchestrator では mark-hook の前に配置

排出は自前の scoped `git add -- design/topics`（design ディレクトリ配下限定）でステージし、mark-hook の
`git add -A -- design` の成否に依存しない。orchestrator では `git add specrunner/changes/`（L284）の後、
mark-hook ブロック（L291）の**前**に排出を呼ぶ。これにより mark-hook が error early-return しても排出は既に
実行済みとなり、mark-hook の成功/失敗から独立する。両経路対応（Goal）は orchestrator への配置だけで自動的に満たす
（`runMergeThenArchive` は内部で orchestrator を呼ぶ）。

- **Rationale**: 要件「mark-hook の成功/失敗には依存しない独立したステージング」の最小実現。mark-hook より前に置くことで
  「mark-hook error → 排出されない」を構造的に排除する。
- **Alternatives considered**: mark-hook の後に配置 — mark-hook が error return すると排出が走らず、独立性を満たせない。却下。

### D8: 排出は best-effort（archive をブロックしない）

排出関数内部のエラー（design/ 判定・mkdir・writeFile・git add 失敗）は escalation にせず、warning を stderr に
出して archive を継続する。topic 排出は設計層バックログへの供給であり、merge/archive をブロックしてはならない。

- **Rationale**: 縮退思想（no-op で既存挙動を壊さない）と整合。取りこぼしは設計債務化するが、archive を止める方が
  高くつく。git add 失敗時はファイルが未ステージで worktree に残るのみ（次回 archive で拾える）。
- **Alternatives considered**: mark-hook と同じく git add 失敗を escalation 化 — バックログ供給の失敗で merge を
  止めるのは過剰。却下。

### D9: `topicEmission?: boolean` を DesignLayerConfig に追加（既定 true）

`DesignLayerConfig` に `topicEmission?: boolean` を、`ResolvedDesignLayer` に `topicEmission: boolean` を追加し、
`resolveDesignLayerConfig` の既定値は true とする。config 検証スキーマ（schema.ts の designLayer object）にも
optional boolean を追加する。`ResolvedDesignLayer` を組み立てる全リテラル（`resolveDesignLayerConfig` /
orchestrator.ts:291 の `noopDesignLayer` / archive.ts:138 の `disabledDesignLayer`）に新フィールドを反映する。

- **Rationale**: `designLayer.enabled` 自体が opt-in であり、その配下では排出が既定で立つ方が契約の既定挙動と整合する。
  opt-out（`topicEmission: false`）は残す。
- **Alternatives considered**: 既定 false — enabled を立てても更に opt-in が要り、契約の既定と乖離。却下。
- **Enumerated impact（必ず全リテラルを更新）**: `ResolvedDesignLayer` を構築する箇所は現状
  (1) `resolveDesignLayerConfig`（schema.ts:1255）、(2) `noopDesignLayer`（orchestrator.ts:291）、
  (3) `disabledDesignLayer`（archive.ts:138）の 3 箇所。新フィールドは required なので 3 箇所すべてに追加しないと
  型エラーになる。(2)(3) は無効時リテラルなので `topicEmission: false` とする。

## Risks / Trade-offs

- [過剰排出でノイズが増える] → 契約が過剰排出を許容し下流は人が裁く前提。dedupe と機械分類（decision-needed /
  origin:"scope" のみ）でノイズを最小化する。取りこぼしより過剰の方が安全という契約の判断に従う。
- [state を orchestrator で保持する改変が Phase 0 の構造に触れる] → 追加は「Phase 0 で抽出済みの値に加えて
  `state.steps` / `state.decisions` を排出関数へ渡す」だけ。既存の抽出ロジックは変えず、参照を hoist する最小変更に留める。
- [`ResolvedDesignLayer` の required フィールド追加で型が全リテラルに波及] → D9 で構築 3 箇所を列挙済み。実装時は
  `topicEmission` を grep して漏れを検出し、`typecheck` で最終担保する。
- [best-effort ゆえ git add 失敗が silent に近い] → warning を stderr に必ず出す。ファイルは worktree に残り次回 archive で
  拾えるため、恒久的な取りこぼしにはならない。
- [排出が既存 archive テストに影響] → 既定の archive テストは designLayer 不在（enabled:false）で走るため排出は skip され、
  no-op。新挙動は designLayer.enabled=true かつ topicEmission!=false のときのみ発火する。

## Open Questions

- なし（v1 のスコープは request で確定済み。source の finding-index は 0 origin、iteration は `StepRun.attempt`
  の 1-origin をそのまま使う点を spec で確定する）。
