# ADR-20260709: 設計層 topic 排出 — archive 時に design-level findings を design/topics/ へ機械排出する

## ステータス

accepted

## コンテキスト

[ADR-20260703-aozu-integration-gates](2026-07-03-aozu-integration-gates.md) は aozu との 2 点結線（入口ゲート + archive 相乗り出口 hook）を確立した。その交換面契約（aozu リポジトリ `spec/integration.md §6`）は、結線点をさらに 1 つ定義している:

> 実装工程で出た設計レベルの摩擦（レビューの構造指摘・スコープ外 finding）をパイプラインが topic として設計正本（`design/topics/`）へ機械排出すること。

契約の要点:

- **排出対象**: 解決が change folder の外——設計正本（`design/`）——への変更を要する finding。過剰排出は許容される（topic の下流は人が裁く。取りこぼし = 設計債務の不可視化の方が高くつく）。
- **書式**: `design/topics/<slug>.md`。flat frontmatter（ネスト・複数行値なし）で `id: top-<slug>`（必須）と `source:`（出所への逆リンク）。本文は症状・動機。暫定裁定を書いてよいが「提案であって決定ではない」。
- **slug 文法**: `^[a-z0-9]+(-[a-z0-9]+)*$`。同一 finding からは常に同一 slug（決定的）。
- **冪等**: 既存ファイルは上書きしない。
- **タイミング**: 遅くとも archive / merge 時。
- **縮退**: designLayer 無効または `design/` 不在では no-op。
- **結線**: aozu CLI の呼び出しは不要。ファイル書き込みのみ。

実地の根拠: aosora プロジェクト（designLayer 有効）の 4 ジョブ（2026-07-04〜05）で halt 6 件のうち 2 件は解決が設計正本に返った（request-review の needs-discussion finding → 依存設計の取り込み手順 ADR の新設 / spec-review escalation の decision-needed findings → design 文書の BAN セマンティクス修正）。この種の finding は従来 escalation 出力・issue コメント・decision ledger にしか残らず、設計層のバックログ（`design/topics/`）には人手でしか届かなかった。

コード上の統合点:

- `src/core/archive/orchestrator.ts` — Phase 1 の `git add specrunner/changes/` → `runDesignLayerMarkHook` → `commitArchive` の順が確立済み。本 change はこの順序に topic 排出を挿入する。
- `src/core/design-layer/mark-hook.ts` — archive 時に外部書き込みを行い scoped `git add` でステージして archive commit に載せる実証済みパターン。
- `src/kernel/report-result.ts` — `Finding { resolution: "fixable" | "decision-needed", origin?: "scope", ... }` が正典型。
- `src/core/pipeline/findings-ledger.ts` — `dedupeFindings` は provenance（step/iteration/index）を落とすため本用途には流用しない。
- `src/core/archive/merge-then-archive.ts` — `runMergeThenArchive` は内部で `runArchiveOrchestrator` を呼ぶ。orchestrator 配置で両経路が自動的に covered される。

## 決定

### D1: 排出モジュールを design-layer 層に新設し、archive 時に実行する

`src/core/design-layer/topic-emission.ts` に `emitDesignTopics(params)` を実装する。mark-hook と同層・同パターンで並べ、orchestrator では `git add specrunner/changes/` の後・`runDesignLayerMarkHook` の**前**に配置する。

- **採用理由**: escalation 時点の finding は後続 iteration で fix され得るため確定は archive 時。archive には「外部書き込みを commit に載せる」実証済みパターン（mark-hook）が既にあり、同層に並べるのが構造的に最小。mark-hook より前に置くことで「mark-hook error → 排出されない」を構造的に排除する（独立性の確保）。
- **却下案 A**: escalation 時排出 — 未確定 finding を排出してしまい、後で fix された finding が topic に残る。却下。
- **却下案 B**: pipeline step として独立 step 化 — state machine / 遷移テーブルの改変が必要で v1 過剰。却下。

### D2: 排出対象は `resolution: "decision-needed"` OR `origin: "scope"` の機械分類とする

全 step run の findings を走査し、`f.resolution === "decision-needed" || f.origin === "scope"` を満たす finding を排出候補とする。fixable findings（`origin: "scope"` でないもの）は除外する。

- **採用理由**: fixable はパイプライン内で解決済みでありノイズが過大。契約が過剰排出を許容しているため、この 2 条件の機械分類で「設計正本へ返るべき finding」を十分に捕捉できる。
- **却下案 A**: 全 finding 排出 — fixable のノイズが過大。却下。
- **却下案 B**: 人の明示マーキング — 新しい UI / ジェスチャーが必要で v1 過剰。却下。

### D3: provenance を保持した専用収集関数を新設し、既存 findings-ledger は流用しない

既存の `dedupeFindings`（`src/core/pipeline/findings-ledger.ts`）は `(file|line|title)` だけを残して step / iteration / index を落とすため流用しない。本 change 専用に `{ finding, step, iteration, index }` を保持したまま収集し、`step|file|line|title` を dedupe キーとする収集関数を新設する。走査順は決定的（step 名を辞書順、run を `attempt` 昇順、finding を配列 index 昇順）とし、同一キーは最初の出現を採用する。

- **採用理由**: slug と source が step / iteration / index を要求するため provenance を捨てられない。dedupe キーに step を含めるのは slug が step を含む（= topic の同一性が step scope）ことと整合し、decision ledger の `computeFindingKey`（step を含む）とも一致する。走査順を固定することで re-archive でも同じ finding が同じ slug に落ちる（冪等性の担保）。
- **却下案**: `dedupeFindings` を provenance 対応に拡張 — regression-gate の意味論（fixable 専用）と混ざり、既存利用の回帰リスク。別関数として分離する方が安全。却下。

### D4: slug は `<job-slug>-<step>-<iteration>-<index>` から決定的に正規化する

topic slug は生文字列 `<job-slug>-<step>-<iteration>-<index>` を契約文法 `^[a-z0-9]+(-[a-z0-9]+)*$` へ正規化して導出する（小文字化 → `[a-z0-9]` 以外をハイフンへ → 連続ハイフンを 1 つに畳む → 先頭/末尾ハイフン除去）。`id` は `top-<slug>`。同一入力からは常に同一 slug（純粋関数）。

- **採用理由**: step 名は既に kebab-case、job-slug も小文字ハイフン、iteration / index は数値なので通常は正規化不要だが、正規化を必ず通すことで契約文法を機械的に保証し、想定外の文字が混じっても壊れない。`source` フィールドにも step / iteration / index が含まれるため、出所の追跡が可能。
- **却下案**: ハッシュ由来 slug — 人が読めず逆リンクの手掛かりにならない。却下。

### D5: topic ファイル書式は flat frontmatter + 症状 / 文脈 / 暫定裁定とする

frontmatter は `id`（`top-<slug>`）と `source`（`specrunner:<job-slug>/<step>-<iteration>#<index>`）の 2 キーのみ（flat、複数行値なし）。本文は finding の title を見出し、rationale を症状として、severity / step / file(:line) を文脈として併記する。decision ledger に対応する裁定（`isFindingDecided` が真）があれば「暫定裁定（提案であって決定ではない）」の見出しで選択肢 label / consequence を併記する。

- **採用理由**: 契約が定める最小書式。逆リンク（`source`）で人が出所を辿れ、暫定裁定は「決定ではない」ことを明示して設計層の裁定権を侵さない。
- **却下案**: options 全列挙や finding JSON 埋め込み — 冗長で人が読む topic の目的に反する。却下。

### D6: 冪等はファイル存在スキップで担保する

書き出し先 `design/topics/<slug>.md` が既に存在すれば上書きせず skip する。slug が決定的なので、再 archive・既存同名ファイル・（理論上の）slug 衝突のいずれでも重複ファイル・重複 ID を作らない。stdout の件数は「新規に書き出した」ファイル数を数える。

- **採用理由**: 契約の「既存ファイルは上書きしない」を最小コストで満たす。既存 topic に人が加筆していても保護される。冪等性は slug の決定的導出（D4）によって構造的に担保される。

### D7: mark-hook から独立した scoped ステージングを行い、orchestrator では mark-hook の前に配置する

排出は自前の scoped `git add -- design/topics`（design/topics 配下限定）でステージし、mark-hook の `git add -A -- design` の成否に依存しない。orchestrator では `git add specrunner/changes/`（archive 記帳の stage）の後、mark-hook ブロックの**前**に排出を呼ぶ。

- **採用理由**: 要件「mark-hook の成功/失敗には依存しない独立したステージング」の最小実現。mark-hook より前に置くことで「mark-hook error → 排出されない」を構造的に排除する。`git add -A -- design` と `git add -- design/topics` は重複ステージングになるが、git のステージング冪等性により問題ない。
- **却下案**: mark-hook の後に配置 — mark-hook が error return すると排出が走らず、独立性を満たせない。却下。

### D8: 排出は best-effort とし archive をブロックしない

排出関数内部のエラー（design/ 判定・mkdir・writeFile・git add 失敗）は escalation にせず、warning を stderr に出して archive を継続する。topic 排出は設計層バックログへの供給であり、merge / archive をブロックしてはならない。git add 失敗時はファイルが未ステージで worktree に残るのみ（次回 archive で拾える）。

- **採用理由**: 縮退思想（no-op で既存挙動を壊さない）と整合。取りこぼしは設計債務化するが、archive を止める方が高くつく。
- **却下案**: mark-hook と同じく git add 失敗を escalation 化 — バックログ供給の失敗で merge を止めるのは過剰。却下。

### D9: `topicEmission?: boolean` を DesignLayerConfig に追加し、既定を true とする

`DesignLayerConfig` に `topicEmission?: boolean` を、`ResolvedDesignLayer` に `topicEmission: boolean` を追加し、`resolveDesignLayerConfig` の既定値は true とする。`ResolvedDesignLayer` を構築する全リテラル（`resolveDesignLayerConfig` / `noopDesignLayer`（orchestrator.ts）/ `disabledDesignLayer`（archive.ts））の 3 箇所に新フィールドを反映する。無効時リテラルでは `topicEmission: false`。

- **採用理由**: `designLayer.enabled` 自体が opt-in であり、その配下では排出が既定で立つ方が契約の既定挙動と整合する。opt-out（`topicEmission: false`）は残す。
- **却下案**: 既定 false — enabled を立てても更に opt-in が要り、契約の既定と乖離。却下。

## 検討した代替案

### A1: escalation 時点でリアルタイム排出する

- **Pros**: finding の発生と同時に topic が設計層に届く。
- **Cons**: escalation 時点の finding は後続 iteration で fix され得る。fix 済み finding が topic に残り、設計層にノイズを生む。
- **Why not**: topic は archive 時点で確定した finding のみを対象とすべき。escalation 時点での確定は保証できない。

### A2: 1 job = 1 topic ファイルに集約する

- **Pros**: topic ファイル数が最小。
- **Cons**: topic は個別に ADR で addressed になる単位であり、集約すると一部だけ決定済みの状態が表現できない。aozu 側の addressed 判定が topic 単位であるため粒度が合わない。
- **Why not**: `1 finding = 1 topic` の方が addressed 判定の粒度と整合し、topic の lifecycle 管理が明確になる。

### A3: 全 finding を排出する（fixable を含む）

- **Pros**: 取りこぼしゼロ。分類ロジック不要。
- **Cons**: fixable はパイプライン内で解決済みでありノイズが過大。設計正本が実装詳細の finding で汚染される。
- **Why not**: 過剰排出を許容するのは「解決が設計正本に返るべき finding」への許容であり、明らかにパイプライン内で解決済みの finding を設計正本に送ることは意図されていない。

### A4: aozu CLI に排出コマンドを追加し呼び出す

- **Pros**: ファイル書式が aozu 側で管理され、契約進化に追従しやすい。
- **Cons**: aozu リポジトリの変更（新コマンド追加）が必要。契約はファイル書き込みのみを要求しており、CLI 呼び出しは不要と明示されている。
- **Why not**: 契約が「aozu CLI の呼び出しは不要（ファイル契約のみ）」と明示。不必要な CLI 依存を持たせると、aozu のバージョン差異・不在時の縮退が複雑化する。

### A5: `dedupeFindings`（findings-ledger）を provenance 対応に拡張する

- **Pros**: 既存コードの再利用。
- **Cons**: `dedupeFindings` は regression-gate 専用で fixable finding の処理を前提とした意味論を持つ。provenance 対応に拡張すると、既存利用との意味論の混在が生じ回帰リスクが高い。
- **Why not**: 別関数として分離する方が安全。regression-gate と topic-emission で dedupe の意味論（キーの構成・保持する情報）が異なる。

## 影響

### Positive

- 設計レベルの finding（decision-needed / origin:"scope"）が archive 時に自動的に設計正本のバックログへ到達する。人手によるトリアージが不要になる。
- aozu の topic lifecycle 管理（addressed 判定、ADR 引用）が人手不要で完結する。
- best-effort 設計により、既存の archive 挙動に影響なし。designLayer 無効プロジェクトは完全に no-op。
- 冪等性により、archive の再実行・障害回復時にも重複 topic が生じない。

### Negative

- archive 実行時に `design/topics/` への file I/O と scoped `git add` が追加される。finding が多い job では複数 topic ファイルの書き込みが archive のクリティカルパスに入る（best-effort なのでブロックはしない）。
- `topicEmission=true`（既定）では、designLayer 有効のすべての job archive で機械分類が走る。false positive の topic が設計正本に届くリスクがある（契約が許容する過剰排出の範囲内）。

### Known Debt

- finding-index は 0-origin で固定（`StepRun.attempt` は 1-origin）。将来 state schema が変わった場合、slug の導出式が変わり既存 topic の冪等性が崩れる可能性がある。
- `design/topics/` が存在しないまま git add が走ると warning が出て skip されるが、worktree に中途半端な状態が残りうる。mkdir の best-effort 失敗を明示的に warn することで最低限の観測可能性は確保している。
- escalation 時点での排出（リアルタイム）は v1 スコープ外。archive まで finding が設計層に届かない時間窓が存在する。

## 参照

- Request: `specrunner/changes/design-topic-emission/request.md`
- Design: `specrunner/changes/design-topic-emission/design.md`
- Related: [ADR-20260703-aozu-integration-gates](2026-07-03-aozu-integration-gates.md) — 設計レイヤ CLI との opt-in 固定結線（入口ゲート + archive 相乗り出口 hook）、本 change はその第 3 結線点
- Related: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — base 直コミット禁止の不変条件（archive 時排出の配置根拠）
