# Delta Spec: pipeline-orchestrator

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

The standard transition table SHALL include the `delta-spec-validation` and `delta-spec-fixer` steps. The `design --success→ spec-review` row SHALL be **replaced** by `design --success→ delta-spec-validation`. The `spec-fixer --approved→ spec-review` row SHALL be **replaced** by `spec-fixer --approved→ delta-spec-validation`. The full table SHALL be:

- `design --success→ delta-spec-validation`
- `design --error→ escalate`
- `delta-spec-validation --approved→ spec-review`
- `delta-spec-validation --needs-fix→ delta-spec-fixer`
- `delta-spec-validation --escalation→ escalate`
- `delta-spec-fixer --approved→ delta-spec-validation`
- `delta-spec-fixer --error→ escalate`
- `spec-review --approved→ test-case-gen`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ delta-spec-validation`
- `spec-fixer --error→ escalate`
- `test-case-gen --success→ implementer`
- `test-case-gen --error→ escalate`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ pr-create`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

The prior rows `design --success→ spec-review` and `spec-fixer --approved→ spec-review` SHALL NOT be present in the table after this change. `delta-spec-validation` is interposed as a gate between design/spec-fixer and spec-review.

#### Scenario: design routes to delta-spec-validation instead of spec-review

- **GIVEN** the standard pipeline
- **WHEN** `design` returns `success`
- **THEN** `Pipeline.run` selects the `design --success→ delta-spec-validation` row
- **AND** the next step executed is `delta-spec-validation`
- **AND** the prior row `design --success→ spec-review` is NOT present in the table

#### Scenario: spec-fixer routes to delta-spec-validation instead of spec-review

- **GIVEN** the standard pipeline
- **WHEN** `spec-fixer` returns `approved`
- **THEN** `Pipeline.run` selects the `spec-fixer --approved→ delta-spec-validation` row
- **AND** the next step executed is `delta-spec-validation`
- **AND** the prior row `spec-fixer --approved→ spec-review` is NOT present in the table

#### Scenario: delta-spec-validation approved routes to spec-review

- **GIVEN** the standard pipeline
- **WHEN** `delta-spec-validation` returns `approved`
- **THEN** `Pipeline.run` selects the `delta-spec-validation --approved→ spec-review` row
- **AND** the next step executed is `spec-review`

#### Scenario: delta-spec-validation needs-fix routes to delta-spec-fixer

- **GIVEN** the standard pipeline
- **WHEN** `delta-spec-validation` returns `needs-fix`
- **THEN** `Pipeline.run` selects the `delta-spec-validation --needs-fix→ delta-spec-fixer` row
- **AND** the next step executed is `delta-spec-fixer`

#### Scenario: delta-spec-fixer approved routes back to delta-spec-validation

- **GIVEN** the standard pipeline
- **WHEN** `delta-spec-fixer` returns `approved`
- **THEN** `Pipeline.run` selects the `delta-spec-fixer --approved→ delta-spec-validation` row
- **AND** the next step executed is `delta-spec-validation` (re-validation loop)

### Requirement: Pipeline Enforces Loop Guard via maxIterations

`Pipeline` SHALL accept a `maxIterations` parameter and SHALL terminate cycles when the cycle count reaches the limit. The loop guard MUST apply to the delta-spec-validation cycle (`delta-spec-validation ↔ delta-spec-fixer`), the spec-layer cycle (`spec-review ↔ spec-fixer`), the implementation-layer build cycle (`verification ↔ build-fixer`), and the implementation-layer review cycle (`code-review ↔ code-fixer`).

The `DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED` error shape SHALL be introduced for the delta-spec-validation cycle.

#### Scenario: delta-spec-validation ↔ delta-spec-fixer cycle terminates at maxIterations

- **GIVEN** `maxIterations = 3`
- **AND** `delta-spec-validation` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED", message: LOOP_ERROR_CODES["delta-spec-validation"].message(3), hint: LOOP_ERROR_CODES["delta-spec-validation"].hint("003") }` — i.e. `message(3) === "delta-spec-validation did not pass after 3 iterations"`

#### Scenario: delta-spec-validation loop counter is independent from spec-review

- **GIVEN** `maxIterations = 3`
- **AND** `delta-spec-validation` has already iterated 2 times (needs-fix → fixer → validation)
- **WHEN** the pipeline later enters `spec-review` for the first time
- **THEN** `spec-review` iteration counter starts at 1 (not 3)
- **AND** `delta-spec-validation` counter remains at 2

### Requirement: Pipeline はループごとのエラーコードを lookup table から取得する

`Pipeline` SHALL retrieve per-cycle error code / message / hint from a `LOOP_ERROR_CODES: Record<StepName, { code: string; message: (n: number) => string; hint: (nnn: string) => string }>` lookup table. The table SHALL include `delta-spec-validation`:

```ts
const LOOP_ERROR_CODES: Record<string, { code: string; message: (n: number) => string; hint: (nnn: string) => string }> = {
  "delta-spec-validation": {
    code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED",
    message: (n) => `delta-spec-validation did not pass after ${n} iterations`,
    hint: (nnn) => `Review delta-spec-validation-result.md and fix path/format violations manually.`,
  },
  "spec-review": { /* unchanged */ },
  "verification": { /* unchanged */ },
  "code-review": { /* unchanged */ },
};
```

#### Scenario: delta-spec-validation ループエラーコードが lookup から導出される

- **WHEN** delta-spec-validation ↔ delta-spec-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["delta-spec-validation"]` を参照して error shape を構築する
- **AND** error.code は `"DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"` である

### Requirement: Pipeline.loopNames 既定値は code-review を含む

`Pipeline` constructor の `loopNames` パラメータ既定値 SHALL `["spec-review", "verification", "code-review"]` とし、`delta-spec-validation` は含まない。delta-spec-validation の retry 上限は paired fixer (delta-spec-fixer) の `fixerIters` で gate される (= `loopFixerPairs` 経由)。

これにより `delta-spec-validation` が approved を返して spec-review に進む経路で、dsv 自身の loopIters がカウントされず、後続 spec-review が paired fixer (spec-fixer) の bypass 機能を正しく受けられる。

#### Scenario: loopNames 既定値に delta-spec-validation が含まれない

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` のみを含み、`"delta-spec-validation"` は含まない

#### Scenario: delta-spec-validation の retry は delta-spec-fixer の fixerIters で gate される

- **GIVEN** `loopFixerPairs` に `delta-spec-validation → delta-spec-fixer` が登録されている
- **WHEN** delta-spec-validation が needs-fix を返し続けると delta-spec-fixer が `maxIterations` 回走る
- **THEN** delta-spec-fixer 入場直前の fixer exhaustion check で `fixerIters[delta-spec-fixer] >= maxIterations` が検出され escalate する
- **AND** error.code は `"DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"` である

## ADDED Requirements

### Requirement: Loop exhaustion bypass is gated by fixer iteration count, not preceding step identity

`Pipeline` の loop exhaustion bypass 条件 SHALL `pairedFixer` の `fixerIters` が `maxIterations` に達していることのみに基づく。直前 step (`currentStep`) が `pairedFixer` 自身であることは要件ではない。これにより `spec-fixer → delta-spec-validation → spec-review` のように fixer と review の間に deterministic step が挿入される transition でも bypass が機能する。

#### Scenario: bypass operates through intermediate deterministic step

- **GIVEN** `spec-review → spec-fixer → delta-spec-validation → spec-review` の transition チェーン
- **AND** spec-fixer が `maxIterations` 回 (= 2) 走った後
- **WHEN** spec-review iteration 3 (bypass) に到達する直前の exhaustion check が行われる
- **THEN** `fixerIters[spec-fixer] >= 2` が成立し bypass が許可される
- **AND** 直前 step が spec-fixer ではなく delta-spec-validation でも bypass は機能する

### Requirement: StepName union includes "delta-spec-validation" and "delta-spec-fixer"

The `StepName` union (`src/state/schema.ts`) SHALL be extended to include the literal values `"delta-spec-validation"` and `"delta-spec-fixer"`, in addition to the existing literals.

#### Scenario: StepName union accepts new step names

- **WHEN** the StepName union is inspected
- **THEN** it contains `"delta-spec-validation"` and `"delta-spec-fixer"` among its literals
