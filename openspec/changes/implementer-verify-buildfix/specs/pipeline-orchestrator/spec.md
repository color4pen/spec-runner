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

The standard transition table SHALL be extended to cover the implementation-layer steps (`implementer`, `verification`, `build-fixer`) added by this change. The full table SHALL be:

- `propose --approved→ spec-review`
- `spec-review --approved→ implementer`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ spec-review`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ end`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`

The `verification --passed→ end` row is intentionally a placeholder; subsequent requests will replace `to: "end"` with `to: "code-review"` without changing the table structure.

#### Scenario: Standard pipeline transitions are expressed as table rows
- **GIVEN** the standard pipeline (propose → spec-review ↔ spec-fixer → implementer → verification ↔ build-fixer → end)
- **WHEN** `Pipeline` is constructed
- **THEN** the transition table contains rows equivalent to:
  - `propose --approved→ spec-review`
  - `spec-review --approved→ implementer`
  - `spec-review --needs-fix→ spec-fixer`
  - `spec-review --escalation→ escalate`
  - `spec-fixer --approved→ spec-review`
  - `implementer --success→ verification`
  - `implementer --error→ escalate`
  - `verification --passed→ end`
  - `verification --failed→ build-fixer`
  - `verification --escalation→ escalate`
  - `build-fixer --success→ verification`
  - `build-fixer --error→ escalate`

#### Scenario: Unknown transition triggers escalation
- **GIVEN** a step produces a verdict that has no matching `Transition` row
- **WHEN** `Pipeline.run` evaluates the routing
- **THEN** the run terminates as `escalate`
- **AND** the failure surfaces via `pipeline:fail` event with a diagnostic payload

### Requirement: Pipeline Enforces Loop Guard via maxIterations
`Pipeline` SHALL accept a `maxIterations` parameter and SHALL terminate cycles when the cycle count reaches the limit. The loop guard MUST apply to both the spec-layer cycle (`spec-review ↔ spec-fixer`) and the implementation-layer cycle (`verification ↔ build-fixer`).

The `SPEC_REVIEW_RETRIES_EXHAUSTED` error shape is preserved verbatim from the pre-refactor behavior. A new error code `VERIFICATION_RETRIES_EXHAUSTED` SHALL be introduced for the implementation-layer cycle, with the same shape (`code`, `message`, `hint`).

The loop name SHALL be derived from the transition table (the bidirectional `step ⇔ step` pair), not from a hardcoded `loopName === "spec-review"` check.

#### Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `spec-review` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `SPEC_REVIEW_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` — identical to the pre-refactor format
- **AND** `state.steps["spec-review"]` 末尾要素の verdict is rewritten to `escalation`
- **AND** the error code matches the pre-refactor behavior verbatim

#### Scenario: verification ↔ build-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `verification` returns `failed` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `VERIFICATION_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "VERIFICATION_RETRIES_EXHAUSTED", message: "verification did not pass after <N> iterations", hint: "Review verification-result-<NNN>.md and inspect failed phases manually." }`
- **AND** `state.steps["verification"]` 末尾要素の verdict is rewritten to `escalation`

## ADDED Requirements

### Requirement: Verdict union includes implementation-layer verdicts

The `Verdict` union (`src/state/schema.ts`) SHALL include the literal values `"passed"`, `"failed"`, `"success"`, `"error"` in addition to the existing `"approved"`, `"needs-fix"`, `"escalation"`. The exhaustiveness of `Verdict` SHALL be enforced by TypeScript exhaustive-switch checks at every site that handles a verdict.

- `passed` / `failed` — produced by `verification` step
- `success` / `error` — produced by `implementer` and `build-fixer` steps via `StepExecutor` lifecycle (verdict file 不在のため CLI 側が導出)
- `approved` / `needs-fix` / `escalation` — produced by `propose` / `spec-review` / `spec-fixer` (unchanged)

`spec-fixer` の `parseResult` は引き続き `{ verdict: null, ... }` を返す（`NULL_PARSE_RESULT` 定数を使用）。`StepExecutor` は `resultFilePath === null` かつ session 正常完了の agent step に対して `verdict: "success"` を導出するため、spec-fixer / implementer / build-fixer の 3 step は全て同一の「session 完了 = success」パターンに統一される。将来的に spec-fixer も `"success"` verdict を明示的に返す `Verdict` 型に移行する際は、`NULL_PARSE_RESULT` 参照を `{ verdict: "success", findingsPath: null, fileContent: null }` に置き換えるだけで完結する（Open Question として記録）。

#### Scenario: Verdict union accepts new literals

- **WHEN** TypeScript compiles a switch statement that exhaustively handles the `Verdict` union
- **THEN** the compilation succeeds when all 7 literals (`approved`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error`) are covered
- **AND** the compilation fails when any of the 7 literals is omitted

### Requirement: Pipeline はループごとのエラーコードを lookup table から取得する

`Pipeline` SHALL retrieve per-cycle error code / message / hint from a `LOOP_ERROR_CODES: Record<StepName, { code: string; message: string; hint: string }>` lookup table. The pipeline MUST derive the cycle endpoint step name from the transition table, look it up in `LOOP_ERROR_CODES`, and assemble the error shape from the resulting entry. Hardcoded error code literals MUST NOT appear in `Pipeline` itself.

```ts
const LOOP_ERROR_CODES: Record<string, { code: string; message: string; hint: string }> = {
  "spec-review": {
    code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
    message: "spec-review did not approve after <N> iterations",
    hint: "Review spec-review-result-<NNN>.md and adjust the request manually.",
  },
  "verification": {
    code: "VERIFICATION_RETRIES_EXHAUSTED",
    message: "verification did not pass after <N> iterations",
    hint: "Review verification-result-<NNN>.md and inspect failed phases manually.",
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

### Requirement: StepName union includes implementation-layer steps

The `StepName` union (`src/state/schema.ts`) SHALL include the literal values `"implementer"`, `"verification"`, `"build-fixer"` in addition to the existing `"propose"`, `"spec-review"`, `"spec-fixer"`.

#### Scenario: StepName union accepts new literals

- **WHEN** the StepName union is inspected
- **THEN** it contains the 6 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`
