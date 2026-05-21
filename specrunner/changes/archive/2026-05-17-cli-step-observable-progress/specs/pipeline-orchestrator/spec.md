# Delta Spec: cli-step-observable-progress

## MODIFIED Requirements

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

## ADDED Requirements

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
