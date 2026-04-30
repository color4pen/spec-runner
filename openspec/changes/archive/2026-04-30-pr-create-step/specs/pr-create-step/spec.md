## ADDED Requirements

### Requirement: PrCreateStep is a CliStep that publishes the branch as a GitHub PR

`PrCreateStep` SHALL be implemented at `src/core/step/pr-create.ts` as a `CliStep` (`kind: "cli"`) with the following invariants:

- `name` SHALL equal `"pr-create"`
- The step SHALL NOT have an `agent` field (per the `CliStep` contract)
- `resultFilePath(state)` SHALL return `openspec/changes/<slug>/pr-create-result.md`
- `parseResult(content)` SHALL extract a `Status: success` or `Status: failed` line from the result file. When `Status: success` is detected, the returned `StepOutcome.verdict` SHALL equal `"success"`. When `Status: failed` is detected, it SHALL equal `"error"`. When neither is detected, `parseResult` SHALL return `{ verdict: null, ... }` and `StepExecutor` SHALL normalize the verdict to `"escalation"`
- `run(state, deps)` SHALL delegate to the `pr-create-runner` module to detect existing PRs and create new ones idempotently, and SHALL write the result file before returning
- The step SHALL NOT contain a retry loop. A single failure of `gh pr create` (or `gh pr view`) SHALL be reported as `Status: failed` and the pipeline SHALL transition via `pr-create --error→ escalate`

#### Scenario: PrCreateStep exposes CliStep shape

- **GIVEN** the `PrCreateStep` instance exported from `src/core/step/pr-create.ts`
- **WHEN** `step` is inspected at runtime
- **THEN** `step.kind === "cli"`
- **AND** the value does NOT have an `agent` property
- **AND** `step.name === "pr-create"`
- **AND** `step.run` is a function returning `Promise<void>`

#### Scenario: PrCreateStep.resultFilePath uses change slug

- **GIVEN** a `JobState` whose change slug is `"pr-create-step"`
- **WHEN** `PrCreateStep.resultFilePath(state)` is invoked
- **THEN** the returned path equals `openspec/changes/pr-create-step/pr-create-result.md`

#### Scenario: PrCreateStep.parseResult maps Status to verdict

- **GIVEN** a `pr-create-result.md` containing the line `## Status: success`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** the returned `StepOutcome.verdict` equals `"success"`

- **GIVEN** a `pr-create-result.md` containing the line `## Status: failed`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** the returned `StepOutcome.verdict` equals `"error"`

### Requirement: PrCreateStep records the resulting PR into JobState

When `PrCreateStep.run` succeeds (either by creating a new PR or by detecting an existing OPEN PR), it SHALL persist `state.pullRequest = { url, number, createdAt }` via `JobStateStore` before writing the result file. The `createdAt` field SHALL be the ISO 8601 timestamp at the moment of detection / creation.

When the run fails, `state.pullRequest` SHALL remain unset (or its prior value preserved when retrying with the same job). `Status: failed` SHALL still be written to the result file with a diagnostic message.

#### Scenario: PR creation persists pullRequest into JobState

- **GIVEN** `PrCreateStep.run` invokes the runner and the runner returns `{ url: "https://github.com/owner/repo/pull/42", number: 42 }`
- **WHEN** `run` returns
- **THEN** `state.pullRequest` equals `{ url: "https://github.com/owner/repo/pull/42", number: 42, createdAt: <ISO8601 timestamp> }`
- **AND** the `pr-create-result.md` contains `## Status: success` and the URL / number

#### Scenario: PR creation failure does not modify pullRequest

- **GIVEN** `PrCreateStep.run` is invoked and the runner throws (gh CLI failure)
- **WHEN** `run` finishes
- **THEN** `state.pullRequest` is unchanged from its pre-call value (undefined for the first attempt)
- **AND** the `pr-create-result.md` contains `## Status: failed` and a diagnostic error message

### Requirement: PrCreateStep is registered into the Pipeline steps Map

`src/core/pipeline/run.ts` SHALL register `PrCreateStep` as an entry in the `steps` Map constructed inside `runPipeline()` (currently lines 40-49), alongside the existing 8 entries (`propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`). `src/cli/run.ts` calls `runPipeline()` as a thin wrapper and SHALL NOT be modified for this registration.

`src/cli/init.ts` SHALL NOT add `PrCreateStep` to the `AgentRegistry.fromSteps()` hardcoded array, because `PrCreateStep` has no `agent` field (`kind: "cli"` mirrors `verification`). `pr-create` is absent from the array, not skipped by it — the registry does not receive it at all.

#### Scenario: Pipeline steps Map contains pr-create

- **WHEN** `runPipeline()` in `src/core/pipeline/run.ts` constructs the `Pipeline`
- **THEN** the `steps` Map has 9 entries with keys including `"pr-create"`
- **AND** the value at `"pr-create"` is the `PrCreateStep` instance

#### Scenario: AgentRegistry does not include pr-create

- **WHEN** `AgentRegistry.fromSteps(hardcodedArray)` is invoked at `specrunner init` time (from `src/cli/init.ts`)
- **THEN** the resulting registry does NOT contain an `"pr-create"` agent entry
- **AND** `PrCreateStep` is NOT present in the hardcoded array passed to `fromSteps`
- **AND** the registry contents are equivalent to the pre-change behaviour for cli-kind steps (`verification` is also absent from the array)
