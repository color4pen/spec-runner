## ADDED Requirements

### Requirement: StepContext includes optional dynamicContext field

`StepContext` (`src/core/types.ts`) SHALL include an optional `dynamicContext?: DynamicContext` field. This field carries the repository snapshot collected by `CommandRunner.execute()`.

The field SHALL be optional to maintain backward compatibility — existing code that constructs `StepContext` without `dynamicContext` SHALL continue to compile and function correctly.

`PipelineDeps` inherits `dynamicContext` from `StepContext` via `extends`.

#### Scenario: StepContext accepts dynamicContext

- **WHEN** a `StepContext` value is constructed with `dynamicContext` set
- **THEN** TypeScript compilation succeeds
- **AND** `deps.dynamicContext` is accessible in `buildMessage`

#### Scenario: StepContext without dynamicContext remains valid

- **WHEN** a `StepContext` value is constructed without `dynamicContext`
- **THEN** TypeScript compilation succeeds
- **AND** `deps.dynamicContext` is `undefined`

### Requirement: AgentRunContext transfers dynamicContext to adapters

`AgentRunContext` (`src/core/port/agent-runner.ts`) SHALL include an optional `dynamicContext?: DynamicContext` field.

`StepExecutor.runAgentStep()` SHALL include `dynamicContext: deps.dynamicContext` in the `ctx` object passed to `runner.run(ctx)`.

Both `ClaudeCodeRunner` and `ManagedAgentRunner` SHALL include `ctx.dynamicContext` in the `stepCtx: StepContext` they construct before calling `step.buildMessage(state, stepCtx)`.

#### Scenario: StepExecutor passes dynamicContext to AgentRunContext

- **GIVEN** `deps.dynamicContext` is a `DynamicContext` value
- **WHEN** `StepExecutor.runAgentStep()` builds the `ctx` object
- **THEN** `ctx.dynamicContext` equals `deps.dynamicContext`

#### Scenario: ClaudeCodeRunner transfers dynamicContext to stepCtx

- **GIVEN** `ctx.dynamicContext` is a `DynamicContext` value
- **WHEN** `ClaudeCodeRunner.run(ctx)` builds `stepCtx`
- **THEN** `stepCtx.dynamicContext` equals `ctx.dynamicContext`

#### Scenario: ManagedAgentRunner transfers dynamicContext to stepCtx

- **GIVEN** `ctx.dynamicContext` is a `DynamicContext` value
- **WHEN** `ManagedAgentRunner.runPollingStyle(ctx)` builds `stepCtx`
- **THEN** `stepCtx.dynamicContext` equals `ctx.dynamicContext`

#### Scenario: dynamicContext undefined is safely forwarded

- **GIVEN** `deps.dynamicContext` is `undefined`
- **WHEN** the full chain (StepExecutor → AgentRunContext → adapter → stepCtx → buildMessage) executes
- **THEN** no errors occur
- **AND** `stepCtx.dynamicContext` is `undefined`
