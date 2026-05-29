# Tasks: outcome-cutover

## T-01: executor.ts — toolResult 優先の verdict 確定ロジック

`finalizeStep` の verdict 確定を toolResult 優先に切替える（Design D1, D2, D6）。

- [x] `finalizeStep` 冒頭に toolResult からの verdict 導出ブロックを追加:
  - `agentResult?.toolResult` が存在する場合:
    - step の `reportTool` が `JUDGE_REPORT_TOOL` or `CODE_REVIEW_REPORT_TOOL` → `(toolResult as JudgeReportResult).approved === true` ? `"approved"` : `"needs-fix"`（`approved` が undefined/false → `"needs-fix"`）
    - それ以外（producer）→ `(toolResult as ProducerReportResult).status === "error"` ? `"error"` : (step の `completionVerdict` ?? `"success"`）（`status === "success"` のときも `completionVerdict` を返す。`completionVerdict = "approved"` の step は "approved" が返り、遷移表の `on: "approved"` にマッチする）
  - toolResult 由来の verdict が確定した場合、既存の prose parse（`step.parseResult`）はスキップする
- [x] import 追加: `JUDGE_REPORT_TOOL`, `CODE_REVIEW_REPORT_TOOL` from `./report-tool.js`, `JudgeReportResult`, `ProducerReportResult` from `../port/report-result.js`
- [x] toolResult が null の場合は既存の prose parse path に fallback（grounded step / CLI step はこの path を通る）

**Acceptance Criteria**:
- judge step で `toolResult.approved === true` → verdict が `"approved"`
- judge step で `toolResult.approved === false` → verdict が `"needs-fix"`
- judge step で `toolResult.approved === undefined` → verdict が `"needs-fix"`
- producer step で `toolResult.status === "success"` → verdict が `completionVerdict`（fallback `"success"`）
- producer step（`completionVerdict = "approved"`）で `toolResult.status === "success"` → verdict が `"approved"`
- producer step で `toolResult.status === "error"` → verdict が `"error"`
- producer step で `toolResult.status === undefined` → verdict が `completionVerdict`（fallback `"success"`）
- grounded step（verification 等）は toolResult を持たず、従来の prose parse path を通る
- `bun run typecheck` が green

## T-02: executor.ts — toolResult === null 時の proceed 化

`executor.ts` L278-308 の no-tool-call halt を proceed に変更する（Design D3）。

- [x] L280 の `if (ctx.policy?.reportTool && runResult.toolResult === null)` ブロックを変更:
  - halt（`stepHaltedNoToolCallError` → `attachStateAndRethrow`）を **削除**
  - 代わりに **proceed**: `finalizeStep` に流す。verdict は `finalizeStep` 内の toolResult === null path で確定される
- [x] `finalizeStep` 内の toolResult === null 時の verdict 確定を step-class 別に変更:
  - judge（`reportTool` が JUDGE or CODE_REVIEW）: verdict = `"needs-fix"`（保守側）
  - producer: 既存の `completionVerdict` fallback（通常 `"success"`）— 変更なし
  - reportTool なし（grounded/CLI）: 既存の prose parse path — 変更なし
- [x] L441 `verdict = verdict ?? "escalation"` の fallback: judge の null-toolResult path で "needs-fix" が入るため、この行に到達するのは grounded step のみ。既存挙動維持。
- [x] `stepHaltedNoToolCallError` の import は残す（R4 で削除、またはテスト用）

**Acceptance Criteria**:
- `toolResult === null` の judge step で halt せず `"needs-fix"` で次 step へ proceed
- `toolResult === null` の producer step で halt せず `completionVerdict`（"success"）で proceed
- malformed JSON は adapter 内で追撃 → 3 回目で halt（この挙動は executor 変更の影響外）
- golden case テストが pass（`tests/unit/contract/golden-cases.test.ts`）

## T-03: types.ts — escalation 遷移の削除

`STANDARD_TRANSITIONS` から judge step の escalation 遷移を削除する（Design D4）。

- [x] `{ step: STEP_NAMES.SPEC_REVIEW, on: "escalation", to: "escalate" }` (L103) を削除
- [x] `{ step: STEP_NAMES.CODE_REVIEW, on: "escalation", to: "escalate" }` (L128) を削除
- [x] grounded step の escalation 遷移は維持:
  - `delta-spec-validation --escalation→ escalate` (L95)
  - `verification --escalation→ escalate` (L111)
- [x] `parseFixableFindings` の import はまだ使用中（T-04 で切替え後も fixable routing で使用しない）→ T-04 後に dead import になるが R4 で削除

**Acceptance Criteria**:
- spec-review / code-review に `on: "escalation"` の遷移行が存在しない
- delta-spec-validation / verification の escalation 遷移が維持されている
- `bun run typecheck` が green

## T-04: types.ts — fixable routing predicate を toolResult.fixableCount に切替

`STANDARD_TRANSITIONS` の code-review approved → code-fixer の `when` predicate を変更する（Design D5）。

- [x] L116-124 の `when` predicate を変更:
  - before: `parseFixableFindings(lastReview.outcome.fileContent) > 0`
  - after: `((lastReview.outcome.toolResult as import("../port/report-result.js").CodeReviewReportResult)?.fixableCount ?? 0) > 0`
- [x] `parseFixableFindings` の import を `types.ts` から削除（使用箇所がなくなるため）
- [x] `toolResult` が null / `fixableCount` が undefined → `?? 0` で fixable なし扱い（通常 approved path へ）

**Acceptance Criteria**:
- fixable routing が `toolResult.fixableCount` を参照している
- `parseFixableFindings(fileContent)` が routing に使われていない
- `parseFixableFindings` の import が `types.ts` から消えている
- `bun run typecheck` が green

## T-05: delta spec — 影響 capability の仕様変更を記述

cutover による仕様変更を delta spec で表現する。

- [x] `specs/tool-driven-step-completion/spec.md` に delta spec を作成:
  - MODIFIED: "halt 時の job status 遷移" — toolResult === null 時の振る舞いを halt → proceed に変更。judge は `"needs-fix"` で proceed、producer は `completionVerdict` で proceed。halt は adapter 内の malformed retry 枯渇のみ
- [x] `specs/pipeline-orchestrator/spec.md` に delta spec を作成:
  - MODIFIED: "Pipeline is Driven by a Declarative Transition Table" — spec-review / code-review の `escalation → escalate` 行を削除。full table 表記から当該 2 行を除外。code-review approved の `when` predicate を `toolResult.fixableCount` ベースに変更
- [x] `specs/step-execution-architecture/spec.md` に delta spec を作成:
  - MODIFIED: "StepExecutor Manages Lifecycle and Emits Events" — Step 8 の verdict 確定を toolResult 優先に変更。toolResult が存在する場合は prose parse をスキップ

**Acceptance Criteria**:
- 各 delta spec ファイルが `specrunner/changes/outcome-cutover/specs/<capability>/spec.md` に存在
- delta spec format（`## Requirements` / `### Requirement:` / `#### Scenario:`）に準拠
- 各 Requirement 本文に `SHALL` or `MUST` が含まれる

## T-06: テスト — cutover 後の verdict 確定を検証

executor の新しい verdict 確定ロジックのユニットテストを追加する。

- [x] `tests/unit/core/step/executor-verdict.test.ts`（新規）を作成:
  - judge + toolResult `{ ok: true, approved: true }` → verdict `"approved"`
  - judge + toolResult `{ ok: true, approved: false }` → verdict `"needs-fix"`
  - judge + toolResult `{ ok: true }` (approved 未設定) → verdict `"needs-fix"`
  - judge + toolResult null → verdict `"needs-fix"` (proceed, halt しない)
  - producer + toolResult `{ ok: true, status: "success" }` → verdict `"success"`
  - producer + toolResult `{ ok: true, status: "error" }` → verdict `"error"`
  - producer + toolResult null → verdict = completionVerdict ("success")
  - code-review + toolResult `{ ok: true, approved: true, fixableCount: 3 }` → verdict `"approved"` (fixableCount は routing 側の関心)
- [x] `tests/unit/contract/golden-cases.test.ts` の既存テストが引き続き pass することを確認（変更不要、regression 検出用）
- [x] transition table テスト（必要に応じて `tests/unit/core/pipeline/` に追加）:
  - spec-review / code-review に escalation 遷移が存在しないことを検証
  - code-review approved + fixableCount > 0 → code-fixer への routing を検証

**Acceptance Criteria**:
- 全テストケースが pass
- `bun run typecheck && bun run test` が green
- R1 golden case テストが regression なし

## T-07: 最終検証 — typecheck + test green

全変更を通した最終検証。

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（R1 golden 含む全テスト pass）
- [x] `types.ts` の `parseFixableFindings` import が消えていることを grep 確認
- [x] `executor.ts` の verdict 確定で `parseReviewVerdict` を直接呼んでいないことを確認（step.parseResult 経由は grounded step 用に残る）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
- 受け入れ基準の全項目を満たす
