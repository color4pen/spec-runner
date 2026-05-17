# pipeline-orchestrator Specification

## Purpose
TBD - created by archiving change 2026-04-29-spec-review-pipeline. Update Purpose after archive.
## Requirements

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

### Requirement: Pipeline Emits Lifecycle Events
`Pipeline.run` SHALL emit lifecycle events through the injected `EventBus`:

- `pipeline:start` at the beginning of `run`
- `pipeline:complete` when the run terminates with verdict `end`
- `pipeline:fail` when the run terminates with verdict `escalate` or by exception

#### Scenario: Successful run emits start and complete
- **GIVEN** a pipeline that ends in `spec-review --approved→ end`
- **WHEN** `Pipeline.run` is invoked and completes
- **THEN** `pipeline:start` is emitted exactly once at the beginning
- **AND** `pipeline:complete` is emitted exactly once at the end
- **AND** `pipeline:fail` is NOT emitted

#### Scenario: Escalation emits pipeline:fail
- **WHEN** `Pipeline.run` terminates due to escalation or loop-guard exhaustion
- **THEN** `pipeline:fail` is emitted with the failure reason in the payload

### Requirement: step implementations are located in src/core/step/
Step implementations SHALL be located at `src/core/step/<step>.ts` (singular `step/`), replacing the prior layout `src/core/steps/<step>.ts` (plural `steps/`).

`Pipeline` itself SHALL be located at `src/core/pipeline/pipeline.ts`.

#### Scenario: File layout
- **WHEN** the change is applied
- **THEN** `src/core/step/propose.ts`, `src/core/step/spec-review.ts`, `src/core/step/spec-fixer.ts` exist
- **AND** `src/core/pipeline/pipeline.ts` exists
- **AND** `src/core/steps/` directory does not exist

### Requirement: Pipeline Emits Iteration Progress to Stdout

`Pipeline.run` SHALL emit iteration progress to stdout for **all steps listed in `loopNames`** (not only the primary `loopName`). This Requirement is the authoritative (single source of truth) definition of these format strings.

The canonical format strings are:

- Iteration start: `[iter <N>/<max>] starting <currentStep>` (for every step in loopNames)
- Iteration verdict approved (terminal): `[iter <N>] <currentStep> verdict: approved → done`
- Iteration verdict escalation (terminal): `[iter <N>] <currentStep> verdict: escalation → halt`
- Iteration verdict needs-fix (non-terminal): `[iter <N>] <currentStep> verdict: needs-fix → spawning fixer`
- Iterations exhausted: `[iter <N>/<max>] retries exhausted on <exhaustedStep>, escalating`

`<currentStep>` is the name of the step currently executing (e.g. `spec-review`, `verification`, `code-review`). The final pipeline summary (`Pipeline finished: spec-review iterations=N, final verdict=V`) continues to use the primary `loopName` (`spec-review`).

These strings MUST be reproduced bit-for-bit by `Pipeline.run`. Any future change to these format strings MUST be made in this Requirement only.

#### Scenario: Iteration progress format — approved (spec-review)

- **WHEN** `Pipeline.run` completes a spec-review iteration and the step returns `approved`
- **THEN** stdout contains `[iter 1/<max>] starting spec-review`
- **AND** stdout contains `[iter 1] spec-review verdict: approved → done`

#### Scenario: Iteration progress format — approved (verification)

- **WHEN** `Pipeline.run` completes a verification iteration and the step returns `passed`
- **THEN** stdout contains `[iter 1/<max>] starting verification`

#### Scenario: Iteration progress format — approved (code-review)

- **WHEN** `Pipeline.run` completes a code-review iteration and the step returns `approved`
- **THEN** stdout contains `[iter 1/<max>] starting code-review`

#### Scenario: Iteration progress format — needs-fix continuation

- **GIVEN** `maxIterations = 2`
- **WHEN** a loopNames step at iter=1 returns `needs-fix` and iter < maxIterations
- **THEN** stdout contains `[iter 1/2] <currentStep> verdict: needs-fix → spawning fixer`
- **AND** `<currentStep>` matches the loop step name (e.g. `spec-review`, `code-review`)

#### Scenario: Iteration progress format — exhausted

- **GIVEN** `maxIterations = 2`
- **WHEN** the loop guard fires for step `<exhaustedStep>`
- **THEN** stdout contains `[iter 2/2] retries exhausted on <exhaustedStep>, escalating`
- **AND** `<exhaustedStep>` identifies which loop step exhausted (e.g. `spec-review`, `verification`)

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

### Requirement: StepName union includes implementation-layer steps

The `StepName` union (`src/state/schema.ts`) SHALL include the literal values `"implementer"`, `"verification"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` in addition to the existing `"propose"`, `"spec-review"`, `"spec-fixer"`.

#### Scenario: StepName union accepts new literals

- **WHEN** the StepName union is inspected
- **THEN** it contains the 8 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`

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

### Requirement: pr-create is excluded from loopNames

`Pipeline.loopNames`既定値 SHALL `["spec-review", "verification", "code-review"]` のままとし、`pr-create` を含めない。pr-create は単発 step（loop なし）であり、iteration 進捗 stdout（`[iter <N>] <loopName> starting`）と loop guard の対象外である。

#### Scenario: pr-create は loopNames に含まれない

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` を含み、`"pr-create"` を含まない

#### Scenario: pr-create 入場時に iteration 進捗は出力されない

- **GIVEN** loopNames 既定値で構築された pipeline
- **WHEN** `pr-create` step が実行される
- **THEN** stdout に `[iter <N>] pr-create starting` という行は出力されない（pr-create は loopNames に含まれないため）

### Requirement: pr-create は LOOP_ERROR_CODES に登録されない

`pr-create` は loop ではないため、`LOOP_ERROR_CODES` lookup table に entry を追加してはならない (MUST NOT)。`Pipeline.handleExhausted` は `pr-create` を考慮 SHALL NOT する。

#### Scenario: LOOP_ERROR_CODES に pr-create は存在しない

- **WHEN** `LOOP_ERROR_CODES` を inspect する
- **THEN** keys は `"spec-review"` / `"verification"` / `"code-review"` の 3 つのみで、`"pr-create"` は含まれない

### Requirement: StepName union includes "pr-create"

The `StepName` union (`src/state/schema.ts`) SHALL be extended to include the literal value `"pr-create"`, in addition to the 8 literals defined by prior changes (`propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`).

#### Scenario: StepName union accepts "pr-create"

- **WHEN** the StepName union is inspected
- **THEN** it contains the 9 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`, `pr-create`

### Requirement: AgentStepName accepts only agent-resident steps (whitelist)

Replaces: "AgentStepName excludes "pr-create" from the Exclude clause"

`AgentStepName` is derived from the `AGENT_STEP_NAMES` whitelist array (`typeof AGENT_STEP_NAMES[number]`), not from `StepName` via `Exclude`. New steps must be added to either `AGENT_STEP_NAMES` or `CLI_STEP_NAMES` in `src/core/step/step-names.ts`; failure to add a step to either array causes a test failure (union mismatch with `STEP_NAMES`).

`CliStepName` is similarly derived from `CLI_STEP_NAMES` (`typeof CLI_STEP_NAMES[number]`).

`config.agents` key type is `Partial<Record<AgentStepName, AgentRecord>>`, preventing CliStep names from being used as agent config keys.

#### Scenario: AgentStepName accepts only agent-resident steps (replaces old scenario)

- **WHEN** `AgentStepName` is inspected via TypeScript type checking
- **THEN** `"design"`, `"spec-review"`, `"spec-fixer"`, `"delta-spec-fixer"`, `"test-case-gen"`, `"implementer"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` ARE assignable to `AgentStepName`
- **AND** `"verification"`, `"pr-create"`, `"delta-spec-validation"` are NOT assignable to `AgentStepName`

#### Scenario: New step addition requires explicit array membership

- **WHEN** a new step is added to `STEP_NAMES` but not to `AGENT_STEP_NAMES` or `CLI_STEP_NAMES`
- **THEN** the exhaustiveness test (union = STEP_NAMES values) fails

#### Scenario: config.agents rejects CliStep keys at type level

- **WHEN** `config.agents["delta-spec-validation"]` is written in TypeScript
- **THEN** a type error is raised because `"delta-spec-validation"` is not in `AgentStepName`

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

### Requirement: Pipeline Emits Step Progress for Non-Loop CliSteps

`Pipeline.run` SHALL emit entry and completion progress to stdout for CliSteps (`step.kind === "cli"`) that are NOT listed in `loopNames`. These steps receive `[step]` format output instead of `[iter N/M]` output.

The canonical format strings are:

- Step entry (before execution): `[step] <step-name>`
- Step completion with verdict: `[step] <step-name>: <verdict>` (only when `parseResult().verdict` is non-null)
- Step completion without verdict (`parseResult().verdict === null`): no completion line

Steps that ARE in loopNames (e.g. `verification`, `code-review`) use `[iter N/M]` output and SHALL NOT emit `[step]` output. AgentSteps (`step.kind === "agent"`) that are not in loopNames are outside the scope of this Requirement and remain silent.

#### Scenario: dsv entry emits [step] delta-spec-validation

- **GIVEN** `delta-spec-validation` is a CliStep and NOT in loopNames
- **WHEN** the pipeline executes `delta-spec-validation`
- **THEN** stdout contains `[step] delta-spec-validation` before the step result

#### Scenario: dsv completion emits [step] delta-spec-validation: approved

- **GIVEN** `delta-spec-validation` returns verdict `approved`
- **THEN** stdout contains `[step] delta-spec-validation: approved`

#### Scenario: pr-create entry emits [step] pr-create

- **GIVEN** `pr-create` is a CliStep and NOT in loopNames
- **WHEN** the pipeline executes `pr-create`
- **THEN** stdout contains `[step] pr-create` before the step result

#### Scenario: pr-create success emits [step] pr-create: success

- **GIVEN** `pr-create` returns verdict `success`
- **THEN** stdout contains `[step] pr-create: success`

#### Scenario: verification does NOT emit [step] line

- **GIVEN** `verification` is a CliStep AND IS in loopNames
- **WHEN** the pipeline executes `verification`
- **THEN** stdout does NOT contain `[step] verification`
- **AND** stdout contains `[iter 1/<max>] starting verification` instead

#### Scenario: AgentStep non-loopNames does NOT emit [step] line

- **GIVEN** `design` is an AgentStep (`kind: "agent"`) and NOT in loopNames
- **WHEN** the pipeline executes `design`
- **THEN** stdout does NOT contain `[step] design` (AgentStep non-loopNames is silent)
