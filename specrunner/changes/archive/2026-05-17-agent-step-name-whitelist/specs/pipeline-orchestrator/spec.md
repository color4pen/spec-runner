# Delta Spec: pipeline-orchestrator (agent-step-name-whitelist)

## MODIFIED Requirements

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
