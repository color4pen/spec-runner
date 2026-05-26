## Requirements

### Requirement: StepExecutor Manages Lifecycle and Emits Events

`StepExecutor` SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching. The `AgentRunContext` SHALL include `requestType` from `deps.request.type` so that adapters can pass it to `getStepExecutionConfig()` for type-aware model resolution.
4. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
5. **For local runtime: call `commitAndPush(step, state, deps)` to stage, commit, and push agent-written files**
6. On success: parse verdict from `resultContent` via `step.parseResult` (or derive verdict from `step.completionVerdict` when `resultContent` is null; if `completionVerdict` is also undefined, fall back to `"escalation"`)
7. Emit `verdict:parsed`
8. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
9. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
10. Emit `step:complete` on success or `step:error` on failure

The `commitAndPush` step (step 5) SHALL only execute when the runtime configuration is `"local"`. For `"managed"` runtime, step 5 SHALL be skipped. All other lifecycle steps remain unchanged.

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution. This dependency is used exclusively by `commitAndPush` and SHALL NOT affect the existing `EventBus` and `AgentRunner` constructor parameters.

#### Scenario: AgentRunContext includes requestType

- **GIVEN** a request with `type: "bug-fix"` and a design step
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` constructs the `AgentRunContext`
- **THEN** `ctx.requestType` equals `"bug-fix"`
- **AND** the adapter can pass `ctx.requestType` to `getStepExecutionConfig()` for type-aware model resolution

#### Scenario: Agent step lifecycle with commitAndPush (local runtime)

- **GIVEN** an agent step that completes successfully via `AgentRunner.run` under local runtime
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → (commitAndPush) → `verdict:parsed` → `step:complete`
- **AND** git commit and push occur between `runner.run()` return and `finalizeStep()`

#### Scenario: Agent step lifecycle without commitAndPush (managed runtime)

- **GIVEN** an agent step that completes successfully via `AgentRunner.run` under managed runtime
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no git subprocess is spawned by the executor
