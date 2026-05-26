# step-execution-architecture Specification (delta)

## Requirements

### Requirement: Executor SHALL propagate requestType to adapter config resolution

The `StepExecutor` SHALL pass `requestType` from `deps.request.type` through `AgentRunContext` so that adapters can resolve step execution config via the `byRequestType` chain.

#### Scenario: requestType is available in AgentRunContext

- **WHEN** StepExecutor builds AgentRunContext for an agent step
- **THEN** `ctx.requestType` SHALL equal `deps.request.type`

## Removed

- "Design and code-review steps inject request.md supplementary sections into agent initial message"
