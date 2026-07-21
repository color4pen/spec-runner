# ADR-20260721: sequential step の commit を write-scope 境界で機械強制する

**Date**: 2026-07-21
**Status**: accepted

Extends: [ADR-20260604-step-io-contracts](2026-06-04-step-io-contracts.md)

## Context

各 step の書込境界（どの step がどの path を編集してよいか）は、`rules.md` の責任範囲表と各
system prompt の Contract 節で**宣言**されているが、機械的には強制されていなかった。sequential step
の commit は `git add -A`（worktree 全体・pathspec なし）で staging するため、agent が境界外
（正典 request.md、他 step の成果物、無関係な source code）へ書いた変更もそのまま同一 commit に
混入する。

実害の前例: spec-review 実行後の commit で `request.md` が弱体化版に書き戻され、以後の全 gate が
弱められた正典を参照した。system prompt には書込禁止が明記されていたが、破られた場合に止める機械が
存在しなかった。

一方、**並列 reviewer round 経路**には coordinator-owned scoped staging が既に存在していた:

- `partitionRoundChanges`（`round-git-scope.ts`）が変更を `toStage`（宣言 ∩ 変更済み）と
  `offending`（変更済み − 宣言 − pipeline 管理）に分離する。
- offending が 1 件でもあれば round 全体を halt する（fail-closed）。

本変更は、この round 経路で確立済みの機構を **sequential commit 経路に対称に導入** し、
宣言と機械を一致させる。

### 前提: step 分類（writes() 実測）

- **成果物が確定的な step（scoped mode）**: request-review / design / spec-review / spec-fixer /
  test-case-gen / code-review / conformance / custom-reviewer / regression-gate。
  `writes(state, deps)` が固定 path を返し、宣言 path のみを stage すれば境界が構造的に保証される。
- **広域 write step（guarded mode）**: implementer / build-fixer / code-fixer / test-materialize
  (`artifact: "gitState"`) / adr-gen（実ファイル名が実行時決定）。成果物を事前列挙できないため
  scoped staging では実装物の silent drop が起きる。

## Decision

### D1: commit 境界での強制（staging scope ＋ 差分検査）

agent がどう書こうと、境界外の変更は「commit されない」か「halt する」かのいずれかになるよう、
commit 境界で機械的に強制する。

- **採用理由**: commit 境界は runtime 非依存の共通経路であり、最小の強制点。既存の scoped staging
  variant（`commitScopedPaths`）と round scan 機構を流用でき実装面積が小さい。
- **却下案: SDK permission（tool-level 遮断）**: provider 依存で managed runtime と挙動が割れる。
  tool-level 遮断は将来の追加防壁として妨げないが、現時点の最小強制点ではない。
- **却下案: 違反変更の自動 revert**: 証跡を消すことになる。halt して人間に見せる方が安全で監査可能。

### D2: 単一ソース `src/core/step/write-scope.ts`（leaf module）

step 名 → staging mode と、広域 write step の禁止 path 集合を、他 module へ依存しない leaf module
（`src/util/paths.ts` のみを import）に集約する。

- `stagingModeFor(stepName): "scoped" | "guarded"` — `GUARDED_WRITE_STEPS`
  集合（implementer / build-fixer / code-fixer / test-materialize / adr-gen）に属する step のみ
  `"guarded"`。**既定は `"scoped"`** とすることで、未分類の新 step や custom reviewer は
  fail-safe（宣言外の書込を commit しない）へ倒れる。
- `protectedCanonPaths(slug)` — request.md / spec.md / design.md / tasks.md / test-cases.md /
  request-review-attestation.json の 6 path。
- `forbiddenWritePaths(stepName, slug, declaredWritePaths)` — `protectedCanonPaths(slug)` と
  判定成果物（`*-result-*.md` / `review-feedback-*.md`）の和から、その step が `writes()` で
  宣言する owned path を差し引いた集合。
- `findWriteScopeViolations(stepName, slug, changedPaths, declaredWritePaths)` —
  changedPaths のうち forbidden に一致し declaredWritePaths に含まれないものを返す。

- **採用理由**: 分類を step 名 key にするのは、custom reviewer が arbitrary 名を持ち `writes()` の
  有無で分類できないため。単一ソースにより rules.ts 責任範囲表との整合をテストで機械保証できる。
- **却下案: `artifact: "gitState"` 有無での自動分類**: adr-gen（gitState ではないが日付 prefix で
  宣言 path が実ファイルと不一致）を scoped と誤分類し silent drop する。却下。

### D3: 確定的 step は scoped staging（既存 variant を流用）

`stagingModeFor` が `"scoped"` の step は、`writes(state, deps)` の file path（`artifact:
"gitState"` を除く）と `pipelineManagedPaths(slug)`（state.json / events.jsonl / usage.json）の
union を pathspec とし、`git add -A -- <paths>` で stage する。

- **採用理由**: pipeline 管理 path を staging 集合に含めるのは、現行の per-step commit が
  `git add -A` で state.json 等を運んでいる挙動（commit 内容同一）を保存するため。round 経路が
  管理 path を per-round commit に含めないのは terminal seam（`commitFinalState`）に委ねる設計で
  あり、sequential per-step commit は現行挙動保存を優先し管理 path を含める。
- **却下案: 宣言 path のみ stage（管理 path 除外）**: state.json が per-step commit から落ち、
  commit 内容が現行と非同一になり既存 integration 期待が揺れる。却下。

### D4: 広域 write step は差分検査 ＋ fail-closed

`stagingModeFor` が `"guarded"` の step は、`git add -A` の **前に**
`git status --porcelain -z --no-renames` で worktree 変更を列挙し、`findWriteScopeViolations`
で禁止領域への変更を照合する。1 件でも違反があれば commit せず、`writeScopeViolationError`
（違反 path を列挙）を throw して halt する（fail-closed）。spawn 失敗も fail-closed。
違反が無ければ従来どおり `git add -A` → commit → push。

- **採用理由**: 列挙不能な write を scoped staging で無理に列挙すると silent drop が起きる。
  禁止領域検出 → halt の方が変更の黙殺より安全で監査可能。add **前** に status を取るのは、
  halt 時に何も stage せず証跡を worktree に残すためであり、round 経路（`listWorktreeChanges`
  → partition → 判定）と対称。
- **却下案: `git diff --cached` で add 後に検査**: 既に stage 済みで halt 後の worktree 状態が
  add 前と変わる。add 前 status の方が挙動が明快で証跡が残る。却下。
- **却下案: 全 step 一律 scoped staging**: implementer の出力は事前列挙不能。silent drop の危険が
  halt より大きい。却下。

### D5: `WRITE_SCOPE_VIOLATION` error code と halt 経路

新 error code `WRITE_SCOPE_VIOLATION` を `ERROR_CODES`（`src/errors.ts`）に追加し、
`writeScopeViolationError(stepName, branch, violatedPaths)` を定義する。`message` に違反 path を
列挙し `hint` に resume 手順を記述する。

`commitAndPush` が throw したこの error は executor が `makeCommitFailHalt`（`step-halt.ts`）で
halt 化し、`ErrorInfo.code = WRITE_SCOPE_VIOLATION` / `message` に違反 path が保持される。

- **採用理由**: 既存の commit-fail halt 経路（`makeCommitFailHalt` が `err.code` を保持）に
  そのまま乗せられ、新しい halt 種別を FSM に足さずに済む。halt 報告に違反 path が残り監査可能。

### D6: spec-review の reads() に request.md を追加

`SpecReviewStep.reads()`（`spec-review.ts`）に `{ path: requestMdPath(deps.slug) }` を追加する。

- **採用理由**: review が request を正典として読む事実が I/O contract（lineage）に残り、
  ADR-20260604-step-io-contracts で確立した pre-execution `validateStepInputs` の検証対象にもなる。

## Alternatives Considered

### A1: SDK permission（tool-level 遮断）での実装

agent の tool 呼び出し段階でファイル書込を遮断する案。

- **Pros**: 書込自体が起きないため、commit 境界に依存しない完全な防壁。
- **Cons**: provider 依存（bypassPermissions / dontAsk モード）で managed runtime と挙動が割れる。
  現行の managed runtime では tool-level write 遮断が保証されない。
- **Why not**: commit 境界は runtime 非依存の共通経路であり、最小の強制点として十分。
  tool-level 遮断は将来の追加防壁として本変更を妨げない。

### A2: 違反変更の自動 revert

境界外の変更を commit 前に自動で `git checkout -- <path>` 等で戻す案。

- **Pros**: human intervention なしにパイプラインを継続できる。
- **Cons**: agent が何を書いたかの証跡を消す。監査・デバッグが困難になる。
  silent な誤魔化しが起きうる。
- **Why not**: halt して人間に見せる方が安全で監査可能。証跡保存が優先。

### A3: 全 step を一律 scoped staging にする

step 分類なしに全 step を `git add -A -- <declaredPaths>` で staging する案。

- **Pros**: 実装が単純で、分類の維持コストが不要。
- **Cons**: implementer 等の広域 write step は出力 path が実行時決定のため、scoped staging では
  実装物が commit から silent drop する。
- **Why not**: silent drop（黙殺）より fail-closed（halt）の方が危険が可視化され安全。
  分類コストは `GUARDED_WRITE_STEPS` の明示集合で管理し許容範囲内。

## Consequences

### Positive

- agent がどう書こうと、request.md 等の正典・他 step 成果物が境界外から commit に入らないことが
  機械的に保証される。宣言と機械が一致した状態に到達する。
- `write-scope.ts` の単一ソースにより、rules.md 責任範囲表との整合をテストで固定でき、
  分類と禁止領域の確認が 1 ファイルで完結する。
- 既定 `"scoped"` により、未分類の新 step や custom reviewer が fail-safe に倒れる（宣言外の書込を
  commit しない）。
- spec-review の reads() に request.md が追加され、review が正典を入力として読む事実が
  I/O contract に残り、validateStepInputs の対象になる。

### Negative

- `commitAndPush` に status 呼び出しと分岐が増え、guarded step の commit 処理に git status の
  extra spawn が追加される。
- `GUARDED_WRITE_STEPS` の集合が step 名のリテラル集合であるため、新しい広域 write step を
  追加する際に `write-scope.ts` への追加も必要となる（分類の維持コスト）。
- 広域 write step が禁止領域を変更した場合は halt になり、人間が worktree を確認・修正して
  resume する必要がある。

### Known Debt

- `GUARDED_WRITE_STEPS` の分類がコードと乖離するリスクは、`write-scope-rules-consistency.test.ts`
  と `write-scope-invariants.test.ts` で緩和されているが、step 追加時の手動更新義務が残る。
  将来は Step インターフェース宣言から自動分類する機構（`stagingMode: "scoped" | "guarded"` 等の
  Step 契約プロパティ）への移行が望ましい。
- 広域 write step に対する **positive allow-list** 強制（例: test-materialize が production code を
  書かない / adr-gen が src を書かない）は本変更のスコープ外。禁止集合は正典・他 step 成果物を
  最低限とし、source code の positive 制約は rules.md の prompt 規律として残す。
- agent 実行時の tool-level write 遮断（SDK permission 層）は本変更で対応しない。
  commit 境界の強制が最初の機械的歯であり、tool-level 遮断は将来の追加防壁。

## References

- Request: `specrunner/changes/step-write-scope-enforcement/request.md`
- Design: `specrunner/changes/step-write-scope-enforcement/design.md`
- Spec: `specrunner/changes/step-write-scope-enforcement/spec.md`
- Implementation: `src/core/step/write-scope.ts`・`src/core/step/commit-push.ts`・`src/core/step/spec-review.ts`・`src/errors.ts`
- Related: [ADR-20260604-step-io-contracts](2026-06-04-step-io-contracts.md) — Step の reads()/writes() 宣言基盤（本 ADR が依存）
- Related: `src/core/pipeline/round-git-scope.ts` — 並列 round 経路の scoped staging（本 ADR はこの機構を sequential 経路に対称導入）
