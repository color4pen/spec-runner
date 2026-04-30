## MODIFIED Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table
The `Pipeline` class SHALL drive step execution as a state machine using a declarative `Transition[]` table provided at construction time.

A `Transition` SHALL have the shape:

```ts
type Transition = {
  step: StepName;
  on: Verdict;            // "approved" | "needs-fix" | "escalation" | "passed" | "failed" | "success" | "error"
  to: StepName | "end" | "escalate";
};
```

Inline `if`-chains for verdict-based step routing in `pipeline.ts` SHALL be replaced by table lookup.

The standard transition table SHALL be extended to cover the code-review and code-fixer steps added by this change. The `verification --passed→ end` row from the prior table SHALL be **replaced** by `verification --passed→ code-review`. The full table SHALL be:

- `propose --success→ spec-review`
- `spec-review --approved→ implementer`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ spec-review`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ end`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`

The `code-review --approved→ end` row is intentionally a placeholder; subsequent requests may replace `to: "end"` with `to: "pr-create"` (or another downstream step) without changing the table structure.

#### Scenario: Standard pipeline transitions are expressed as table rows
- **GIVEN** the standard pipeline (propose → spec-review ↔ spec-fixer → implementer → verification ↔ build-fixer → code-review ↔ code-fixer → end)
- **WHEN** `Pipeline` is constructed
- **THEN** the transition table contains the rows enumerated in this Requirement (the full transition list defined above)

#### Scenario: verification passed routes to code-review
- **GIVEN** the standard pipeline
- **WHEN** `verification` returns `passed`
- **THEN** `Pipeline.run` selects the `verification --passed→ code-review` row
- **AND** the next step executed is `code-review`
- **AND** the prior row `verification --passed→ end` is NOT present in the table

#### Scenario: Unknown transition triggers escalation
- **GIVEN** a step produces a verdict that has no matching `Transition` row
- **WHEN** `Pipeline.run` evaluates the routing
- **THEN** the run terminates as `escalate`
- **AND** the failure surfaces via `pipeline:fail` event with a diagnostic payload

### Requirement: Pipeline Enforces Loop Guard via maxIterations
`Pipeline` SHALL accept a `maxIterations` parameter and SHALL terminate cycles when the cycle count reaches the limit. The loop guard MUST apply to the spec-layer cycle (`spec-review ↔ spec-fixer`), the implementation-layer build cycle (`verification ↔ build-fixer`), and the implementation-layer review cycle (`code-review ↔ code-fixer`).

The `SPEC_REVIEW_RETRIES_EXHAUSTED` and `VERIFICATION_RETRIES_EXHAUSTED` error shapes are preserved verbatim. A new error code `CODE_REVIEW_RETRIES_EXHAUSTED` SHALL be introduced for the code-review cycle, with the same shape (`code`, `message`, `hint`).

The loop name SHALL be derived from the transition table (the bidirectional `step ⇔ step` pair), not from a hardcoded literal check.

#### Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `spec-review` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `SPEC_REVIEW_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: LOOP_ERROR_CODES["spec-review"].message(3), hint: LOOP_ERROR_CODES["spec-review"].hint("003") }` — i.e. `message(3) === "spec-review did not approve after 3 iterations"`, identical to the pre-refactor format
- **AND** `state.steps["spec-review"]` 末尾要素の verdict is rewritten to `escalation`
- **AND** the error code matches the pre-refactor behavior verbatim

#### Scenario: verification ↔ build-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `verification` returns `failed` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `VERIFICATION_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "VERIFICATION_RETRIES_EXHAUSTED", message: LOOP_ERROR_CODES["verification"].message(3), hint: LOOP_ERROR_CODES["verification"].hint("003") }` — i.e. `message(3) === "verification did not pass after 3 iterations"`
- **AND** `state.steps["verification"]` 末尾要素の verdict is rewritten to `escalation`

#### Scenario: code-review ↔ code-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `code-review` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `CODE_REVIEW_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "CODE_REVIEW_RETRIES_EXHAUSTED", message: LOOP_ERROR_CODES["code-review"].message(3), hint: LOOP_ERROR_CODES["code-review"].hint("003") }` — i.e. `message(3) === "code-review did not approve after 3 iterations"`
- **AND** `state.steps["code-review"]` 末尾要素の verdict is rewritten to `escalation`

### Requirement: Pipeline はループごとのエラーコードを lookup table から取得する

`Pipeline` SHALL retrieve per-cycle error code / message / hint from a `LOOP_ERROR_CODES: Record<StepName, { code: string; message: (n: number) => string; hint: (nnn: string) => string }>` lookup table. The pipeline MUST derive the cycle endpoint step name from the transition table, look it up in `LOOP_ERROR_CODES`, and assemble the error shape from the resulting entry. Hardcoded error code literals MUST NOT appear in `Pipeline` itself.

```ts
const LOOP_ERROR_CODES: Record<string, { code: string; message: (n: number) => string; hint: (nnn: string) => string }> = {
  "spec-review": {
    code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `spec-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review spec-review-result-${nnn}.md and adjust the request manually.`,
  },
  "verification": {
    code: "VERIFICATION_RETRIES_EXHAUSTED",
    message: (n) => `verification did not pass after ${n} iterations`,
    hint: (nnn) => `Review verification-result-${nnn}.md and inspect failed phases manually.`,
  },
  "code-review": {
    code: "CODE_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `code-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review review-feedback-${nnn}.md and address findings manually.`,
  },
};
```

新しい cycle を追加する際は `LOOP_ERROR_CODES` に 1 エントリを追加するだけでよく、`Pipeline.handleExhausted` の実装は無編集である。

#### Scenario: ループエラーコードが lookup から導出される

- **WHEN** spec-review ↔ spec-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["spec-review"]` を参照して error shape を構築する
- **AND** error.code は `"SPEC_REVIEW_RETRIES_EXHAUSTED"` である

- **WHEN** verification ↔ build-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["verification"]` を参照して error shape を構築する
- **AND** error.code は `"VERIFICATION_RETRIES_EXHAUSTED"` である

- **WHEN** code-review ↔ code-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["code-review"]` を参照して error shape を構築する
- **AND** error.code は `"CODE_REVIEW_RETRIES_EXHAUSTED"` である

### Requirement: StepName union includes implementation-layer steps

The `StepName` union (`src/state/schema.ts`) SHALL include the literal values `"implementer"`, `"verification"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` in addition to the existing `"propose"`, `"spec-review"`, `"spec-fixer"`.

#### Scenario: StepName union accepts new literals

- **WHEN** the StepName union is inspected
- **THEN** it contains the 8 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`

## ADDED Requirements

### Requirement: Pipeline.loopNames 既定値は code-review を含む

`Pipeline` constructor の `loopNames` パラメータ既定値 SHALL `["spec-review", "verification", "code-review"]` とし、iteration 進捗 stdout（`[iter <N>] <loopName> starting` 等）と loop guard が code-review ↔ code-fixer cycle にも適用されるようにする。明示的に `loopNames` を渡された場合はその値を優先する（既存契約と一致）。

#### Scenario: loopNames 既定値に code-review が含まれる

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` を含む

#### Scenario: code-review 入場時に iteration 進捗が stdout に出る

- **GIVEN** loopNames 既定値で構築された pipeline
- **WHEN** `code-review` step が iteration 1 として開始する
- **THEN** stdout に `[iter 1] code-review starting` が出力される
