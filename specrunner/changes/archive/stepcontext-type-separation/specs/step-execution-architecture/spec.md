## ADDED Requirements

### Requirement: StepContext is the minimal type for Step method parameters

`src/core/types.ts` SHALL export a `StepContext` interface containing only the fields that Step methods (`buildMessage`, `resultFilePath`, `parseResult`, `run`) actually access:

```ts
export interface StepContext {
  config: SpecRunnerConfig;
  slug: string;
  cwd?: string;
  request: ParsedRequest;
  repo: OriginInfo;
}
```

`PipelineDeps` SHALL extend `StepContext`, adding runtime-specific fields (`client`, `githubClient`, `sleepFn`) that are NOT visible to Step implementations.

`src/core/step/types.ts` SHALL redefine `StepDeps` as an alias for `StepContext` (not `PipelineDeps`):

```ts
export type StepDeps = StepContext;
```

All Step method signatures (`buildMessage(state, deps)`, `resultFilePath(state, deps)`, `parseResult(content, deps)`, `run(state, deps)`) continue to accept `StepDeps` as the second parameter. Because `PipelineDeps extends StepContext`, callers passing `PipelineDeps` remain type-compatible.

#### Scenario: StepContext contains only step-relevant fields

- **WHEN** `StepContext` is inspected
- **THEN** it contains exactly: `config`, `slug`, `cwd?`, `request`, `repo`
- **AND** it does NOT contain `client`, `githubClient`, or `sleepFn`

#### Scenario: PipelineDeps extends StepContext

- **WHEN** a `PipelineDeps` value is passed where `StepContext` is expected
- **THEN** TypeScript compilation succeeds (Liskov substitution)
- **AND** `PipelineDeps` retains `client?`, `githubClient`, and `sleepFn?` fields in addition to `StepContext` fields

#### Scenario: StepDeps is aliased to StepContext

- **WHEN** `StepDeps` is resolved by the TypeScript compiler
- **THEN** it resolves to `StepContext` (not `PipelineDeps`)

#### Scenario: ClaudeCodeRunner constructs StepContext without undefined as any

- **GIVEN** `ClaudeCodeRunner.run(ctx)` needs to call `step.buildMessage(state, deps)` and `step.resultFilePath(state, deps)`
- **WHEN** the deps parameter is constructed
- **THEN** the deps object contains only `StepContext` fields (`config`, `slug`, `cwd`, `request`, `repo`)
- **AND** `grep -r "undefined as any" src/` returns zero matches

### Requirement: StepExecutor is the sole state persistence authority for agent steps

`StepExecutor.runAgentStep` SHALL be the sole code path that persists `JobState` for agent step executions. `AgentRunner` adapters (both `ManagedAgentRunner` and `ClaudeCodeRunner`) SHALL NOT import or instantiate `JobStateStore`, SHALL NOT call `store.update`/`store.appendHistory`/`store.fail`/`store.persist`, and SHALL NOT call `pushStepResult`.

`AgentRunner.run()` SHALL return only the fields defined in `AgentRunResult` (`completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`). The `_updatedState` extension field SHALL NOT exist.

`StepExecutor.runAgentStep` SHALL handle all state persistence:

1. Call `store.update(state, { step: step.name })` at the method entry point (before calling `runner.run`)
2. Call `runner.run(ctx)` and receive `AgentRunResult`
3. On error: `recordFailedStepResult` → `store.fail` → `store.persist` → rethrow
4. On success: parse verdict from `resultContent` → `pushStepResult` → `store.appendHistory` → `store.persist`
5. Record `result.sessionId` in the step result's session field when present
6. Set `state.branch` from `result.agentBranch` when present and `state.branch` is not yet set

There SHALL be no `_updatedState` check or managed/local branching in executor. The same code path applies regardless of which `AgentRunner` adapter is used.

#### Scenario: ManagedAgentRunner does not import JobStateStore

- **WHEN** `src/adapter/managed-agent/agent-runner.ts` is inspected
- **THEN** it does NOT import `JobStateStore` from any path
- **AND** it does NOT import `pushStepResult` from any path

#### Scenario: _updatedState is fully removed

- **WHEN** `grep -r "_updatedState" src/` is executed
- **THEN** zero matches are returned

#### Scenario: executor runAgentStep has no managed/local branching

- **WHEN** `StepExecutor.runAgentStep` source is inspected
- **THEN** there is no conditional check for `_updatedState` or adapter-type branching
- **AND** the same state persistence logic applies for all `AgentRunner` implementations

#### Scenario: runAgentStep calls store.update at entry point

- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` is invoked
- **THEN** `store.update(state, { step: step.name })` is called before `runner.run(ctx)`
- **AND** `specrunner ps` reflects the current step name during execution

#### Scenario: sessionId from AgentRunResult is recorded in step result

- **GIVEN** `runner.run(ctx)` returns `{ completionReason: "success", resultContent: "...", sessionId: "sess-abc" }`
- **WHEN** the executor persists the step result
- **THEN** the `StepRun.sessionId` field equals `"sess-abc"`

#### Scenario: agentBranch from AgentRunResult is recorded in state.branch

- **GIVEN** `runner.run(ctx)` returns `{ completionReason: "success", resultContent: "...", agentBranch: "feat/my-change" }`
- **AND** `state.branch` is empty or absent
- **WHEN** the executor processes the result
- **THEN** `state.branch` is set to `"feat/my-change"`

## MODIFIED Requirements

### Requirement: Step is a Declarative Interface

A pipeline step SHALL be expressed as a value implementing the `Step` interface. The interface SHALL be a discriminated union with a `kind` field separating two execution strategies:

- `kind: "agent"` — the step delegates to a Managed Agents session (existing behavior)
- `kind: "cli"` — the step runs entirely inside the SpecRunner CLI process without any Anthropic session

The `Step` union SHALL have the shape:

```ts
type Step = AgentStep | CliStep;

type AgentStep = {
  kind: "agent";
  name: StepName;
  agent: AgentDefinition;       // complete AgentDefinition (name, role, model, system, tools, capabilities)
  toolHandlers?: Map<string, ToolHandler>;
  buildMessage(state: JobState, deps: StepDeps): string;
  resultFilePath(state: JobState, deps: StepDeps): string | null;
  parseResult(content: string, deps: StepDeps): StepOutcome;
};

type CliStep = {
  kind: "cli";
  name: StepName;
  resultFilePath(state: JobState, deps: StepDeps): string;
  parseResult(content: string, deps: StepDeps): StepOutcome;
  run(state: JobState, deps: StepDeps): Promise<void>;  // direct CLI execution
};
```

`StepDeps` is an alias for `StepContext` (the minimal interface containing `config`, `slug`, `cwd?`, `request`, `repo`). Step methods SHALL NOT receive `PipelineDeps` directly.

`Step` implementations SHALL NOT manage I/O lifecycle (session creation, polling, persistence, event emission). Lifecycle is the responsibility of `StepExecutor`.

`AgentStep` implementations MUST own the full `AgentDefinition` value (system prompt, model, tools). The Anthropic agent ID itself is resolved at runtime from `ConfigStore` keyed by `step.agent.role`.

`CliStep` implementations MUST NOT have an `agent` field. The lifecycle distinction is governed solely by the `kind` discriminator (no implicit data-presence inference).

#### Scenario: Step implementation is stateless
- **WHEN** the same `Step` instance is used to execute the same step twice with identical inputs
- **THEN** `buildMessage` (agent) / `run` (cli) / `resultFilePath` / `parseResult` produce identical outputs
- **AND** the `Step` instance does not accumulate state between invocations

#### Scenario: AgentStep exposes its agent definition
- **WHEN** `StepExecutor` needs to bind the step to a Managed Agent
- **THEN** it reads `step.agent` directly to obtain the full `AgentDefinition`
- **AND** it resolves the runtime Anthropic agent ID via `ConfigStore.getAgentId(step.agent.role)`
- **AND** it does NOT consult any global agent registry from inside `StepExecutor`
- **AND** it does NOT consult a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate map

#### Scenario: AgentStep.agent is a complete AgentDefinition
- **GIVEN** any concrete `AgentStep` implementation (e.g., `ProposeStep`, `SpecReviewStep`, `SpecFixerStep`, `ImplementerStep`, `BuildFixerStep`)
- **WHEN** `step.agent` is inspected at runtime
- **THEN** the value contains `name`, `role`, `model`, `system`, and `tools` fields populated by the step itself
- **AND** the value does NOT contain a `agentId` placeholder field

#### Scenario: CliStep has no agent field
- **GIVEN** a concrete `CliStep` implementation (e.g., `VerificationStep`)
- **WHEN** `step` is inspected at runtime
- **THEN** `step.kind === "cli"`
- **AND** the value does NOT have an `agent` property

### Requirement: StepExecutor Manages Lifecycle and Emits Events

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching
4. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
5. On success: parse verdict from `resultContent` via `step.parseResult` (or derive `verdict` from `step.completionVerdict` when `resultContent` is null)
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
8. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
9. Emit `step:complete` on success or `step:error` on failure

For `kind: "cli"` steps:

1. Emit `step:start`
2. Skip session creation, agent ID resolution, and `buildMessage` invocation
3. Invoke `step.run(state, deps)` and `await` its completion
4. Fetch the artifact at `step.resultFilePath`
5. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun`
8. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` SHALL accept its dependencies (`EventBus`, `AgentRunner`) via constructor injection. `StepExecutor` MUST NOT contain a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate role-mapping; the role is read from `step.agent.role` directly. `StepExecutor` MUST NOT contain hardcoded step-name branches (e.g., `if (step.name === "verification")`); the only allowed dispatch is on `step.kind`. Helper functions within `StepExecutor` (e.g., `runPollingStyleStep`) MUST also contain no hardcoded step-name literals; grep for step-name string literals (e.g., `"spec-review"`, `"verification"`) in `executor.ts` MUST return zero matches.

`StepExecutor` SHALL be the sole code path that persists `JobState` for both agent and CLI step executions. `AgentRunner` adapters SHALL NOT perform state persistence.

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
- **GIVEN** an agent step that completes successfully
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no `step:error` event is emitted

#### Scenario: CliStep lifecycle events fire in order
- **GIVEN** a CLI step that completes successfully
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** Anthropic SessionClient.create is NOT called
- **AND** no `step:error` event is emitted

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
- **WHEN** an exception is raised during the step lifecycle (either kind)
- **THEN** `step:error` is emitted with the error payload
- **AND** the exception bubbles up with the `err.state` field attached for upstream consumers
- **AND** `failJobState` and `appendHistory` semantics are preserved verbatim
