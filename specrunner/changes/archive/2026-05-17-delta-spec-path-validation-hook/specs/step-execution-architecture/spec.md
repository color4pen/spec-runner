# Delta Spec: step-execution-architecture

## ADDED Requirements

### Requirement: DeltaSpecValidationStep is a CliStep that validates delta spec paths and format

`DeltaSpecValidationStep` SHALL be implemented at `src/core/step/delta-spec-validation.ts` as a `CliStep` (`kind: "cli"`) with the following invariants:

- `name` SHALL equal `"delta-spec-validation"`
- The step SHALL NOT have an `agent` field (per the `CliStep` contract)
- `run(state, deps)` SHALL invoke `validateDeltaSpecPaths()` from `src/core/spec/delta-spec-validator.ts` with the change folder path derived from `deps.slug`
- `run` SHALL write a `delta-spec-validation-result.md` file containing a markdown summary of violations (or an "all clear" message)
- `resultFilePath(state, deps)` SHALL return the path to `delta-spec-validation-result.md` within the change folder
- `parseResult(content)` SHALL return `{ verdict: "approved", findingsPath: null }` when the result indicates no violations, and `{ verdict: "needs-fix", findingsPath: <result-path> }` when violations are present

#### Scenario: DeltaSpecValidationStep.kind is "cli" and has no agent field

- **GIVEN** the `DeltaSpecValidationStep` instance exported from `src/core/step/delta-spec-validation.ts`
- **WHEN** the step is inspected
- **THEN** `step.kind === "cli"`
- **AND** the step has no `agent` property
- **AND** `step.name === "delta-spec-validation"`

#### Scenario: DeltaSpecValidationStep passes when delta specs are valid

- **GIVEN** a change folder with delta specs at `specs/<capability>/spec.md` containing valid `## ADDED Requirements` sections
- **WHEN** `DeltaSpecValidationStep.run(state, deps)` executes
- **THEN** `delta-spec-validation-result.md` is written with no violations
- **AND** `parseResult` returns `{ verdict: "approved", findingsPath: null }`

#### Scenario: DeltaSpecValidationStep fails when legacy paths are detected

- **GIVEN** a change folder containing `delta-spec/managed-cli-commands.md` (legacy path)
- **WHEN** `DeltaSpecValidationStep.run(state, deps)` executes
- **THEN** `delta-spec-validation-result.md` is written listing the violation
- **AND** `parseResult` returns `{ verdict: "needs-fix", findingsPath: <path> }`

### Requirement: DeltaSpecFixerStep is an AgentStep that fixes delta spec path and format violations

`DeltaSpecFixerStep` SHALL be implemented at `src/core/step/delta-spec-fixer.ts` as an `AgentStep` (`kind: "agent"`) with the following invariants:

- `name` SHALL equal `"delta-spec-fixer"`
- `agent.role` SHALL equal `"delta-spec-fixer"`
- `agent.name` SHALL equal `"specrunner-delta-spec-fixer"`
- `agent.model` SHALL equal `"claude-sonnet-4-6"` (fixer-class step)
- `agent.system` SHALL be the `SPEC_FIXER_SYSTEM_PROMPT` exported from `src/prompts/spec-fixer-system.ts` (reuse, not a new prompt)
- `phase` SHALL equal `"spec"`
- `completionVerdict` SHALL equal `"approved"` (enabling `delta-spec-fixer → delta-spec-validation` loop)
- `requiresCommit` SHALL equal `true`
- `maxTurns` SHALL equal `25`
- `resultFilePath(state, deps)` SHALL return `null`
- `parseResult` SHALL return `NULL_PARSE_RESULT`
- `buildMessage(state, deps)` SHALL inject the path to `delta-spec-validation-result.md` so the agent can read the violation details

#### Scenario: DeltaSpecFixerStep reuses spec-fixer system prompt

- **GIVEN** the `DeltaSpecFixerStep` instance exported from `src/core/step/delta-spec-fixer.ts`
- **WHEN** `step.agent.system` is inspected
- **THEN** it equals `SPEC_FIXER_SYSTEM_PROMPT` (the same string used by `SpecFixerStep`)

#### Scenario: DeltaSpecFixerStep.buildMessage includes validation result path

- **GIVEN** a previous `delta-spec-validation` step produced `delta-spec-validation-result.md`
- **WHEN** `DeltaSpecFixerStep.buildMessage(state, deps)` is invoked
- **THEN** the produced message string contains the path to `delta-spec-validation-result.md`
- **AND** the message instructs the agent to read and fix the listed violations

#### Scenario: DeltaSpecFixerStep completion verdict enables loop

- **GIVEN** the `DeltaSpecFixerStep` instance
- **WHEN** the step completes via agent polling
- **THEN** `completionVerdict === "approved"`
- **AND** the transition table routes to `delta-spec-validation` for re-validation

### Requirement: DeltaSpecValidationStep and DeltaSpecFixerStep are excluded from AgentStepName

The `AgentStepName` type SHALL exclude `"delta-spec-validation"` (it is a CliStep, not an AgentStep). `"delta-spec-fixer"` MUST be included in `AgentStepName` as it is an agent-resident step.

#### Scenario: delta-spec-validation is not assignable to AgentStepName

- **WHEN** `AgentStepName` is inspected
- **THEN** `"delta-spec-validation"` is NOT assignable to `AgentStepName`
- **AND** `"delta-spec-fixer"` IS assignable to `AgentStepName`
