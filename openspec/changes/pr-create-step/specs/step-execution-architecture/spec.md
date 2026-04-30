## ADDED Requirements

### Requirement: PrCreateStep is a CliStep with no agent and no retry

`PrCreateStep` SHALL be implemented at `src/core/step/pr-create.ts` as a `CliStep` (`kind: "cli"`) with the following invariants:

- `name` SHALL equal `"pr-create"`
- The step SHALL NOT have an `agent` field (per the `CliStep` contract; the lifecycle distinction is governed solely by `kind`)
- `resultFilePath(state)` SHALL return `openspec/changes/<slug>/pr-create-result.md`
- `parseResult(content)` SHALL return a `StepOutcome` whose `verdict` is one of `"success"` (when the result file contains `## Status: success`) or `"error"` (when it contains `## Status: failed`). When neither marker is present, `parseResult` SHALL return `{ verdict: null, ... }` and `StepExecutor` SHALL normalize the verdict to `"escalation"` (existing rule for CLI steps with null verdict)
- `run(state, deps)` SHALL invoke `runPrCreate` from `src/core/pr-create/runner.ts`, persist the resulting `pullRequest` via `JobStateStore` on success, and write `pr-create-result.md` before returning
- `run` SHALL NOT contain a retry loop. Any single gh CLI failure SHALL surface as `Status: failed` and trigger the `pr-create --error→ escalate` transition. The pipeline is idempotent across re-runs because the runner detects existing OPEN PRs

#### Scenario: PrCreateStep.kind is "cli" and has no agent field

- **GIVEN** the `PrCreateStep` instance exported from `src/core/step/pr-create.ts`
- **WHEN** the step is inspected
- **THEN** `step.kind === "cli"`
- **AND** the step has no `agent` property
- **AND** `step.run` is a function returning `Promise<void>`

#### Scenario: PrCreateStep.parseResult maps Status markers to verdicts

- **GIVEN** content `## Status: success\n...`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === "success"`

- **GIVEN** content `## Status: failed\n...`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === "error"`

- **GIVEN** content with no `## Status:` line
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === null`
- **AND** `StepExecutor` normalizes the persisted `StepRun.outcome.verdict` to `"escalation"`

### Requirement: StepExecutor handles pr-create like other CliSteps

`StepExecutor` SHALL execute `PrCreateStep` via the same `kind: "cli"` lifecycle path used by `VerificationStep`:

1. Emit `step:start`
2. Skip session creation, agent ID resolution, and `buildMessage` invocation
3. Invoke `step.run(state, deps)` and `await` its completion
4. Fetch the artifact at `step.resultFilePath`
5. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun`
8. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` MUST NOT contain a hardcoded branch for `step.name === "pr-create"`. Dispatch SHALL remain on `step.kind` only (existing invariant).

#### Scenario: pr-create lifecycle events fire in order

- **GIVEN** `PrCreateStep` runs successfully
- **WHEN** `StepExecutor.execute(prCreateStep, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** `SessionClient.create` is NOT called (CLI step path)

#### Scenario: StepExecutor dispatch is on kind only after pr-create addition

- **WHEN** `src/core/step/executor.ts` is grepped for `"pr-create"` string literal
- **THEN** zero matches are returned
- **AND** dispatch occurs only on `step.kind`
