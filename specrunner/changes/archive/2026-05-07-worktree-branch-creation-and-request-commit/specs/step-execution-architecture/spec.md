## MODIFIED Requirements

### Requirement: Custom Tool Spec and Handler Co-located With Step
Custom Tool specifications and their handlers SHALL be owned by the `Step` that uses them, when custom tools exist. The `register_branch` tool is removed from the codebase (the tool is no longer needed because branch creation is the CLI's responsibility). ProposeStep SHALL NOT have `toolHandlers` — it has no custom tools.

#### Scenario: ProposeStep has no toolHandlers
- **WHEN** `ProposeStep.toolHandlers` is inspected
- **THEN** the value is `undefined`
- **AND** no `register_branch` handler exists anywhere in the step definitions

#### Scenario: input_schema for register_branch is removed
- **WHEN** the codebase is searched for `register_branch` tool definition
- **THEN** no tool definition for `register_branch` exists in any step or adapter

### Requirement: setsBranch generates jobId-suffixed branch name

When `step.setsBranch === true` and `state.branch` is absent after step completion, `StepExecutor` SHALL set `state.branch` to `${getBranchPrefix(request.type)}${deps.slug}-${state.jobId.slice(0, 8)}`. This is a fallback path — in the primary flow, `state.branch` is set by `setupWorkspace()` before the pipeline starts, so the `setsBranch` flag does not fire.

The primary branch-setting path is:
1. `setupWorkspace()` creates the branch and records `jobState.branch`
2. `CommandRunner.execute()` reflects `jobState.branch` into in-memory state
3. Pipeline starts with `state.branch` already set
4. `setsBranch` flag in executor is a safety net that only fires if `state.branch` is somehow still absent after step completion

#### Scenario: setsBranch does not fire when branch is pre-set

- **GIVEN** a step with `setsBranch: true` and `state.branch` is already set by `setupWorkspace()`
- **WHEN** `StepExecutor` processes the `setsBranch` flag after step completion
- **THEN** `state.branch` remains unchanged (the pre-set value is preserved)

#### Scenario: setsBranch fallback generates jobId-suffixed branch

- **GIVEN** a step with `setsBranch: true` and `state.branch` is absent (edge case — e.g., state corruption)
- **AND** `state.jobId` is `"45e9e720-1234-5678-abcd-ef0123456789"`
- **AND** `deps.slug` is `"my-feature"`
- **WHEN** `StepExecutor` processes the `setsBranch` flag after step completion
- **THEN** `state.branch` is set to `"feat/my-feature-45e9e720"`

#### Scenario: ProposeStep.buildMessage uses state.branch

- **GIVEN** `ProposeStep.buildMessage(state, deps)` is invoked
- **AND** `state.branch` is `"change/my-feature-abcdef01"` (set by CLI before pipeline)
- **WHEN** the resulting message is inspected
- **THEN** the branch parameter in the message is `"change/my-feature-abcdef01"`
- **AND** the message does NOT instruct the agent to create the branch
