# Design: scope を評価できない runtime では fail-closed に escalation する（RuntimeStrategy 評価可能性 predicate）

## Context

#689（scope-exceeded-escalation）はスコープ超過を `RuntimeStrategy.listChangedFiles` の changed-files から機械的に導出し、`deriveScopeBreach` → `synthesizeScopeFindings` → `decision-needed` → escalation に載せる土台を入れた。その seam の戻り値 `string[]` の `[]` は実際には **3 状態を畳んでいる**:

- (a) 評価済みで変更なし
- (b) git エラー（local の `catch` → `[]`、`src/core/runtime/local.ts:655-670`）
- (c) 評価不能（managed は worktree が無く構造的に常に `[]`、`src/core/runtime/managed.ts:496-502`）

この seam には **安全方向が正反対の 2 消費者** がいる（検証済み）:

- 消費者1 = reviewer activation（`src/core/step/executor.ts:204`）。`[]` → パス条件マッチせず → reviewer を **過少起動**。skip は保守的なので **fail-safe**。
- 消費者2 = scope-check（`computeExtraScopeFindings`、`src/core/step/scope-check.ts`）。`[]` → `deriveScopeBreach` が `breached:false` → **スコープ内として全通し**。これは **fail-open**。

とくに managed では `listChangedFiles` が構造的に常に `[]`（(c)）なので、managed 上で `permissionScope` を宣言した profile は「評価できなかった」を「スコープ内だった」と報告する。これは scope 機構の存在意義（責務を越えたら黙って通さない）と「記録は正直」原則の両方に反する。

「記録は正直」を seam に適用すると、scope の用途では「評価できなかった」を「スコープ内だった」に畳んではいけない。評価不能を **UNKNOWN** として顕在化させ escalation に倒す（fail-closed）。activation の用途は従来どおり fail-safe（`[]` → 過少起動）でよく、両者の契約は分けて満たす。

検証済みの現状（コードを読んで確認した前提、main = `d2f6b6245`）:

- `listChangedFiles` の契約は「Never throws、あらゆるエラーで `[]` を返す」（`src/core/port/runtime-strategy.ts:364-380` の JSDoc）。
- `RuntimeStrategy`（`src/core/port/runtime-strategy.ts:143`）に「changed-files を評価できる runtime か」を表す predicate は無い。
- `computeExtraScopeFindings`（`src/core/step/scope-check.ts`）は `permissionScope` absent / `stepName !== checkpoint` / `runtimeStrategy` 不在のとき `[]` を返す early guard を持つ。**managed は `runtimeStrategy: this`（`managed.ts:292`）を持つ**ため、この guard を通過し `listChangedFiles → []` → 無 breach に落ちる（local も `local.ts:565` で `runtimeStrategy: this`）。
- breach 合成は `synthesizeScopeFindings`（`src/core/pipeline/scope.ts`、純関数）。`origin:"scope"` / `resolution:"decision-needed"` / 決定的 `computeFindingKey`（`src/core/decision/decision-ledger.ts:32`）で、`deriveJudgeVerdict`（`src/core/step/judge-verdict.ts:37`）→ escalation、decision-ledger で人間解決済みは再 escalate しない。
- 合成 finding は executor が judge / conformance 分岐で `extraScopeFindings` として agent findings に **追記** する（`src/core/step/executor.ts:659-712`）。
- `FindingResolution`（`src/kernel/report-result.ts:15`）は `fixable | decision-needed` の 2 値。`origin?: "scope"` discriminator は #689 で追加済み（`report-result.ts:74`）。
- 影響を受ける既存 test fake の実数 ≈10（型注釈 `: RuntimeStrategy` / `as RuntimeStrategy` / `listChangedFiles` を持つ full-shape fake）。

本 request は #689 の機構の上に乗る土台ハードニングであり、scope を宣言する利用者 profile（軽量 fast pipeline 等）は別 request（スコープ外）。

## Goals / Non-Goals

**Goals**:

- `RuntimeStrategy` に「changed-files の導出が可能な runtime か」を表す **optional** predicate `canDeriveChangedFiles?(): boolean` を additive に足す（評価可能性のメタ情報。`listChangedFiles` の戻り値契約には触れない）。
- 実 runtime に明示実装する: local → `true`、managed → `false`。
- scope-check に「scope 宣言あり ＋ checkpoint ＋ 評価不能（predicate=`false`）→ `listChangedFiles` を呼ばず UNKNOWN な `decision-needed` を合成」する fail-closed 分岐を足す。UNKNOWN は breach とは別 finding だが `origin:"scope"` / decision-ledger / escalation を #689 と共有し、同一経路に乗せる。
- optional の残穴（将来の実 runtime が predicate を実装し忘れて黙って fail-open に戻る）を **本 request 内で** mechanical に固定する。
- predicate を実装しない runtime（test fake）は #689 の既存経路（`listChangedFiles`）へフォールスルー＝現行挙動を完全維持。activation 消費者も完全に無改変。

**Non-Goals**（スコープ外）:

- local の git エラー由来 `[]`（状態 (b)）の精密化。これは `listChangedFiles` の戻り値契約変更を伴うため別 request（既知 debt）。本 request の predicate は runtime-class の評価可能性（managed=不能）のみを扱う。
- managed 用の changed-files seam を新設して managed でも評価可能にすること。本 request は「評価できないなら fail-closed」であって、managed に diff 能力を与えるものではない。
- 軽量 fast pipeline 本体（新 descriptor ＋ permissionScope 宣言）、昇格（fast→standard）/ 再分類 / fixup 再入場。
- 既存 pipeline（`standard` / `design-only`）の挙動変更。スコープ未宣言のまま無改変。
- `FindingResolution` への新 resolution 値の追加（本 request は型で「追加しないこと」を固定）。
- 新しい escalation 機構・並行 escalation 経路の新設。

## Decisions

### D1: 評価可能性は port の predicate で表す（`listChangedFiles` の戻り値契約は触らない）

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts:143`）に optional method を 1 つ足す。意味は次のとおり:

- absent → `listChangedFiles` 経路へフォールスルー（＝ 現行挙動）。fail-closed scope 評価は **発火しない**。
- `true` → changed-files を導出できる（例: local の worktree）。
- `false` → changed-files を導出できない（例: managed、worktree が無い）。

`listChangedFiles` の戻り値型・契約（`string[]`、Never throws、`[]` on error）は **変更しない**。predicate は seam のメタ情報として直交に足すだけ。JSDoc に「scope-check が fail-closed に使う／activation 消費者は参照せず fail-safe を維持する」を明記する。

**Rationale**: 支配的な穴は managed の構造的 `[]`（状態 (c)）であり、これは「この runtime は changed-files を導出できるか」という runtime-class のメタ情報で捕捉できる。`listChangedFiles` の戻り値を変えると、安全方向が正反対の activation 消費者（fail-safe を維持したい）の契約とテストを巻き込む。additive・optional な predicate は #689 の「optional / absent=現行」スタイルと同型で、activation 消費者・既存テストに非干渉。

**Alternatives considered**:

- **却下 B（`listChangedFiles` を `{evaluated, files} | {evaluated:false, reason}` の discriminated return に変更）**: local の git エラー (b) まで fail-closed にできて最も honest だが、activation 消費者の契約とテストを巻き込む。支配的な穴は (c) であり predicate で捕捉できる。(b) の精密化はスコープ外（別 request）に切る方が「1 request = 1 収束ループ」に合う。
- **却下 C（scope 専用の changed-files seam method を新設）**: 各消費者に固有契約を与えられて綺麗だが、データ返却 seam の新設は #689 ADR の「最小依存原則」に反する。predicate（メタ情報）の追加の方が軽い。

### D2: predicate は optional（必須にしない）。absent はフォールスルー＝現行挙動

`canDeriveChangedFiles` を **必須** method にすると、`: RuntimeStrategy` / `as RuntimeStrategy` で full object を構成する既存 test fake（≈10 ファイル）が TS2741 で compile 不能になり、受け入れ基準「既存テスト無変更で green」と矛盾する。よって optional とする。

absent の意味は「評価不能」ではなく **#689 の既存経路（`listChangedFiles`）へフォールスルー＝現行挙動**。fail-closed 判定が効くのは predicate を明示実装した実 runtime（managed=`false`）のときだけ。predicate が `true` または absent のときは #689 の挙動（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）と完全一致する。

**Rationale**: 「fake のための optional」と「real runtime の fail-closed」を両立する最小設計。`true`/absent は #689 と完全一致なので回帰ゼロ。

**Alternatives considered**: 必須メソッド化 → 却下（既存 fake を TS2741 で壊す、AC と矛盾）。

### D3: optional の残穴は実 runtime に対して型レベルで mechanical に固定する（本 request 内で閉じる）

optional ＋「absent → フォールスルー（＝評価可能扱い）」は test fake を守る反面、将来 `src/core/runtime/` に追加される実 runtime が `canDeriveChangedFiles` を実装し忘れると黙って fail-open に戻る穴を作る。#689 の「機械的に導出する歯」思想に倣い、これを mechanical に固定する。Known Debt / follow-up に流さず本 request 内で閉じる（cheap・on-thesis・deferral trap 回避）。

**採用機構（型レベルを primary）**: port に必須版の型エイリアス `RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean }` を定義し export する。`LocalRuntime` / `ManagedRuntime` を `implements RealRuntimeStrategy` に変更する（port `RuntimeStrategy` は optional のまま ＝ fake 非干渉）。必須版を implements するので、将来の実 runtime が predicate を忘れると **コンパイル時に落ちる**。`runtimeStrategy: this`（`local.ts:565` / `managed.ts:292`）は field 型 `runtimeStrategy?: RuntimeStrategy`（`src/core/types.ts:91`）への部分型代入で通り、scope-check は従来どおり `RuntimeStrategy` 越しに `canDeriveChangedFiles?.()` を optional 呼び出しする。

**backstop（grep arch test、O(1) 維持）**: 型レベルの pin は「新クラスが `implements RealRuntimeStrategy` と書く」前提なので、bare `implements RuntimeStrategy` と書けばすり抜ける。これを塞ぐため、既存 `core-invariants` の grep と同型の不変条件を 1 本足す: **`src/core/runtime/` 配下に bare `implements RuntimeStrategy`（`RealRuntimeStrategy` ではない形）が出現しないこと**を検証する。これは method 単位の grep ではなく「bare implements の不在」を見る単一アサーションなので、predicate 以外の method が増えても維持コストが増えない（#689 が警告した「各 method を grep する維持地獄」には陥らない）。`tests/` 配下の fake は対象外（optional の利便性を維持）。

型レベル（primary）と grep backstop（bypass 封じ）の二重化で、optional の利便性（fake 非干渉）と fail-closed の堅さ（実 runtime の取りこぼし防止）を両立する。

**Rationale**: 受け入れ基準「`src/core/runtime/` の全 `implements RuntimeStrategy` 具象クラスが `canDeriveChangedFiles` を実装していることが mechanical に固定」を、コンパイル時失敗（最強の歯）＋ bypass を塞ぐ 1 本の grep で満たす。

**Alternatives considered**:

- grep arch test のみ（型レベルなし）→ 却下せず可だが、コンパイル時に落ちる型レベルの方が歯として強い。primary を型レベルに置く。
- 型レベルのみ（grep backstop なし）→ bare `implements RuntimeStrategy` ですり抜ける穴が残る。1 本の grep で塞げるので塞ぐ。

### D4: 評価可能性は runtime kind ではなく port predicate 越しに問う

scope-check（domain）が local / managed の kind を直接知るのは B-1（domain → adapter 非依存）／DSM 違反。評価可能性は `runtimeStrategy.canDeriveChangedFiles?.()`（port の predicate）越しに問う。scope-check は runtime の具象を一切 import しない。

**Rationale**: #689 の seam 利用（domain は port 越しにしか I/O メタ情報に触れない）を踏襲。

### D5: UNKNOWN は breach と別 finding、ただし同一経路（純関数を scope.ts に追加）

`src/core/pipeline/scope.ts`（純関数 module）に `synthesizeScopeUnverifiableFinding(ctx)` を足す。breach 合成（`synthesizeScopeFindings`）とは **title / rationale / options が異なる**が、以下は #689 と共有する:

- `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`。
- `file` = 決定的 anchor（当該 change の `request.md`、worktree に必ず存在）＝ breach 合成と同じ anchor 算出（`SynthesisContext = { slug }`）。
- 固定文言で **決定的** に作る（同一 runtime 条件なら同一 `computeFindingKey`）。

文言（決定的）:

- title: breach の `Scope exceeded: ...` とは別文言にし、「scope を検証できなかった（UNKNOWN）」を表す固定文にする（key が breach finding と衝突しないため）。
- rationale: 「この runtime では changed-files を導出できないため、宣言された permissionScope を検証できなかった。スコープ内とも超過とも確定していない（UNKNOWN）」旨の固定文。
- options（決定的 3 択、≥2 契約を満たす）:
  1. changed-files を導出できる runtime（例: local）で実行し直す。
  2. この profile の permissionScope 宣言を外す（以降 scope 検証は走らない）。
  3. scope 検証なしで進めることを受け入れる（リスク受容で前進）。

UNKNOWN finding は `decision-needed` なので `deriveJudgeVerdict` → `escalation` → `awaiting-resume` に落ち、`getOpenDecisionFindings`（issue-notifier）で拾われ、`computeFindingKey` が決定的なので人間が `/resume` で決めた UNKNOWN は decision-ledger により再 escalate しない。breach 合成と並行機構を新設しない。

**Rationale**: scope を「検証できなかった」と「超過した」は別事象なので finding 文言・options を分ける。が、`decision-needed`・`origin:"scope"`・decision-ledger・escalation 導出は #689 のまま共有し、verdict 導出 / issue 描画 / options 契約の再実装を避ける。純関数を `src/core/pipeline/` 配下に置くことで既存 B-5（fs call-site ゼロ）と child_process grep が自動でカバーする。options に「リスク受容で進める」を含めることで、評価不能な runtime でも人間判断で前進できる逃げ道を残す（#689 の「出口は人間へ」を踏襲、fail-closed の既定は拒否でなく escalation）。

**Alternatives considered**:

- breach finding を流用し rationale だけ変える → 却下（「超過した」と読める title のまま「検証できなかった」を報告すると記録が不正直）。
- 新 resolution 値 `unverifiable` を足す → 却下（`FindingResolution` union を壊し、decision-ledger key / escalation 導出 / issue 描画 / options 契約を作り直す並行機構新設。`origin:"scope"` + 別文言で十分）。

### D6: fail-closed 分岐は scope-check の early guard 直後に置く（listChangedFiles を呼ぶ前）

`computeExtraScopeFindings`（`src/core/step/scope-check.ts`）の既存 early guard（`permissionScope` 不在 / `stepName !== checkpoint` / `runtimeStrategy` 不在で `[]`）の直後、`listChangedFiles` を呼ぶ前に fail-closed 分岐を足す:

- `deps.runtimeStrategy.canDeriveChangedFiles?.() === false` のとき → `listChangedFiles` を **呼ばず** `synthesizeScopeUnverifiableFinding({ slug: deps.slug })` を返す。
- predicate が `true` または absent（`?.()` が `undefined`）のとき → `=== false` が偽 → 現行経路（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）へフォールスルー（#689 と完全一致）。

返した UNKNOWN finding は executor の判定経路（`isJudgeStep` / `isConformanceStep` の `extraScopeFindings` 合流、`executor.ts:659-712`）に #689 の breach finding と同じく乗り、`decision-needed` → `escalation` に落ちる。

**Rationale**: `false` の明示判定（`=== false`）にすることで absent / `true` をフォールスルーに畳む。`listChangedFiles` を呼ばないことで「評価できないのに評価したふり」を構造的に排除し、AC「`listChangedFiles` を呼ばず」を満たす。合成点を新 step に切らず既存合流点に乗せるので並行機構ゼロ。

### D7: activation 消費者・既定挙動は不変

- reviewer activation（`executor.ts:202-214`）は `listChangedFiles` の戻り値も契約も変わらず、predicate を参照しない。完全に無改変（managed の過少起動 fail-safe を維持）。
- `permissionScope` を宣言する profile が無い限り、scope-check は従来どおり early guard で `[]`。`PIPELINE_REGISTRY`（`standard` / `design-only`）は無改変。
- `FindingResolution` union は `fixable | decision-needed` のまま。新 resolution 値を足さない。

**Rationale**: 本 request は土台ハードニングで、scope 宣言 profile を持たないため既定挙動は完全一致。fail-closed が観測されるのは「scope 宣言あり ＋ checkpoint ＋ predicate=`false`」の交差のみ。

## Risks / Trade-offs

- [Risk] managed では UNKNOWN finding の `file` anchor（`specrunner/changes/<slug>/request.md`）を `verifyFindingRefs` が「存在しない ref」と判定し得る（managed は `getRawFile`、branch null なら全 ref non-existent 扱い）。→ Mitigation: その場合でも executor は verdict を `escalation` に倒す（`executor.ts:726-728`）ので望む出口（`awaiting-resume`）は変わらない。#689 の同型 anchor リスクと同じ扱い。
- [Risk] 型レベル pin は新クラスが `implements RealRuntimeStrategy` と書く前提で、bare `implements RuntimeStrategy` ですり抜ける。→ Mitigation: D3 の grep backstop（bare implements の不在を 1 本のアサーションで検証）で塞ぐ。
- [Trade-off] optional predicate は absent をフォールスルー（評価可能扱い）に畳むため、predicate を実装しない fake は fail-closed の対象外。→ これは意図どおり（fake 非干渉を守るため）。実 runtime の取りこぼしは D3 で機械固定する。
- [Trade-off] local の git エラー由来 `[]`（状態 (b)）は本 request では依然 fail-open。→ 意図的にスコープ外（戻り値契約変更を伴う別 request の既知 debt）。本土台は構造的・支配的な穴（managed の常時 `[]`）に集中する。

## Open Questions

- なし（architect 評価で採用案 A・optional・型レベル primary + grep backstop が確定済み）。利用者 profile（scope 宣言する fast pipeline 等）が別 request で本 predicate の上に乗る。
