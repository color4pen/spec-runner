# step-execution-architecture

## ADDED Requirements

### Requirement: setsBranch generates jobId-suffixed branch name

When `step.setsBranch === true` and `state.branch` is absent after step completion, `StepExecutor` SHALL set `state.branch` to `feat/${deps.slug}-${state.jobId.slice(0, 8)}`. The jobId is UUID format; the first 8 characters are hex digits. This ensures each run operates on an independent branch even when the same slug is reused.

#### Scenario: setsBranch generates jobId-suffixed branch

- **GIVEN** a step with `setsBranch: true` and `state.branch` is absent
- **AND** `state.jobId` is `"45e9e720-1234-5678-abcd-ef0123456789"`
- **AND** `deps.slug` is `"my-feature"`
- **WHEN** `StepExecutor` processes the `setsBranch` flag after step completion
- **THEN** `state.branch` is set to `"feat/my-feature-45e9e720"`

#### Scenario: ProposeStep.buildMessage passes jobId-suffixed branch to agent

- **GIVEN** `ProposeStep.buildMessage(state, deps)` is invoked
- **AND** `state.jobId` is `"abcdef01-..."`
- **AND** `deps.slug` is `"my-feature"`
- **WHEN** the resulting message is inspected
- **THEN** the branch parameter is `"feat/my-feature-abcdef01"`
- **AND** the slug parameter is `"my-feature"` (unchanged)
