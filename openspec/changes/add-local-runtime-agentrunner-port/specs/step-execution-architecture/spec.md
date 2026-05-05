## MODIFIED Requirements

### Requirement: StepExecutor Manages Lifecycle and Emits Events

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Build an `AgentRunContext` from the current `JobState`, the CLI-canonical branch (`feat/<slug>`), the slug, the worktree path (`cwd`), the prompt material (`requestContent`), and the global `config`
3. Invoke `runner.run(ctx)` where `runner` is an injected `AgentRunner` (see `agent-runner-port` capability) and await the result
4. If `result.completionReason !== "success"`, emit `step:error` and route through the existing `failJobState` / `appendHistory` path
5. If `step.resultFilePath(state) !== null`, pass `result.resultContent` to `step.parseResult` to obtain a `StepOutcome`
6. If `step.resultFilePath(state) === null`, synthesize the `StepOutcome` from `NULL_PARSE_RESULT` (existing behavior for spec-fixer / implementer / build-fixer / code-fixer)
7. Emit `verdict:parsed`
8. Persist the `StepRun` via `JobStateStore.appendStepRun`
9. Emit `step:complete` on success or `step:error` on failure

For `kind: "cli"` steps:

1. Emit `step:start`
2. Skip `AgentRunner` invocation entirely (`runner.run` is not called)
3. Invoke `step.run(state, deps)` and `await` its completion
4. Fetch the artifact at `step.resultFilePath`
5. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun`
8. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` SHALL accept its dependencies (`AgentRunner`, `JobStateStore`, `EventBus`, `ConfigStore`) via constructor injection. `StepExecutor` MUST NOT directly depend on `SessionClient`, `GitHubClient` (for agent step result fetching), `@anthropic-ai/sdk`, or `@anthropic-ai/claude-code` — all runtime-specific concerns are mediated by the `AgentRunner` port. `GitHubClient` injection remains permitted for `CliStep` paths (e.g., pr-create). `StepExecutor` MUST NOT contain a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate role-mapping; the role is read from `step.agent.role` directly inside the `AgentRunner` adapter (no longer in `StepExecutor`). `StepExecutor` MUST NOT contain hardcoded step-name branches (e.g., `if (step.name === "verification")`); the only allowed dispatch is on `step.kind`. Helper functions within `StepExecutor` (e.g., `runPollingStyleStep`) MUST also contain no hardcoded step-name literals; grep for step-name string literals (e.g., `"spec-review"`, `"verification"`) in `executor.ts` MUST return zero matches.

When a CLI step's `parseResult` returns `{ verdict: null, ... }`, `StepExecutor` MUST normalize the verdict to `"escalation"` before persisting the `StepRun`. This ensures that an unrecognized verification-result.md format is routed through the `verification --escalation→ escalate` transition rather than causing an undefined routing state.

`src/core/step/types.ts` SHALL export a shared `NULL_PARSE_RESULT` constant:

```ts
export const NULL_PARSE_RESULT: ParsedStepResult = {
  verdict: null,
  findingsPath: null,
  fileContent: null,
};
```

This constant is shared by `spec-fixer`, `implementer`, and `build-fixer` agent steps (all three have `resultFilePath === null` and produce no verdict file).

#### Scenario: AgentStep lifecycle events fire in order
- **GIVEN** an agent step that completes successfully via `AgentRunner.run`
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no `step:error` event is emitted

#### Scenario: CliStep lifecycle events fire in order
- **GIVEN** a CLI step that completes successfully
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** `AgentRunner.run` is NOT called
- **AND** no `step:error` event is emitted

#### Scenario: AgentStep delegates to AgentRunner.run
- **GIVEN** any AgentStep instance
- **WHEN** `StepExecutor.execute(step, state)` is invoked
- **THEN** `runner.run(ctx)` is awaited exactly once with `ctx.step === step`
- **AND** `SessionClient.create` is NOT directly called from `executor.ts`
- **AND** session protocol details (SSE / polling / register_branch dispatch) are not visible from `executor.ts`

#### Scenario: StepExecutor dispatch is on kind only
- **WHEN** `src/core/step/executor.ts` is grepped
- **THEN** dispatch occurs only on `step.kind`
- **AND** no `if (step.name === ...)` or equivalent step-name hardcoded branch exists
- **AND** no step-name string literals (e.g., `"spec-review"`, `"verification"`, `"build-fixer"`) appear in executor.ts or executor-helpers.ts

#### Scenario: CLI step verdict null is normalized to escalation
- **GIVEN** a CLI step whose `parseResult` returns `{ verdict: null, findingsPath: <path> }`
- **WHEN** `StepExecutor.execute(step, state)` processes the parsed outcome
- **THEN** the persisted `StepRun` has `verdict: "escalation"` (not `null`)
- **AND** the pipeline routes via the `verification --escalation→ escalate` transition

#### Scenario: Error path emits step:error and decorates exception
- **WHEN** an exception is raised during the step lifecycle (either kind), or `runner.run` resolves with `completionReason !== "success"`
- **THEN** `step:error` is emitted with the error payload
- **AND** the exception bubbles up with the `err.state` field attached for upstream consumers
- **AND** `failJobState` and `appendHistory` semantics are preserved verbatim

### Requirement: Custom Tool Spec and Handler Co-located With Step

Custom Tool specifications and their handlers SHALL be owned at the runtime layer that uses them. The global tool registry (formerly at `src/core/tools/registry.ts`) SHALL remain removed.

For Custom Tools whose protocol is **runtime-specific** (e.g., `register_branch`, which is dispatched via the Managed Agents SSE `agent.custom_tool_use` event), ownership SHALL reside in the corresponding runtime adapter (e.g., `src/adapter/managed-agent/tools/`). `Step` implementations MUST NOT carry runtime-specific tools in their `toolHandlers` map; the runtime adapter SHALL inject such tools when constructing the agent invocation, keyed off `step.agent.role` or `step.name`.

For Custom Tools that are **runtime-neutral** (none currently exist; reserved for future use), ownership MAY remain on the `Step` instance via its `toolHandlers` map.

#### Scenario: register_branch handler is owned by managed-agent adapter
- **WHEN** the propose step runs under `runtime: "managed"`
- **THEN** the `register_branch` handler is resolved from `src/adapter/managed-agent/tools/`
- **AND** `ProposeStep.toolHandlers` does NOT contain `register_branch`
- **AND** no other step has access to that handler instance

#### Scenario: register_branch absent under local runtime
- **WHEN** the propose step runs under `runtime: "local"` via `ClaudeCodeRunner`
- **THEN** the `register_branch` Custom Tool is NOT registered with the SDK
- **AND** the agent receives a `git checkout -b` instruction in `additionalInstructions` instead

#### Scenario: input_schema for register_branch is unchanged under managed runtime
- **WHEN** `ManagedAgentRunner` constructs the agent's `custom_tools` array for ProposeStep
- **THEN** the Custom Tool definition for `register_branch` has the same `input_schema` JSON as before this change
- **AND** the tool name string `"register_branch"` is unchanged
