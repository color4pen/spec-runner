# step-execution-architecture Delta Spec

## ADDED Requirements

### Requirement: AgentStep declares optional enrichContext for pre-buildMessage context enrichment

`AgentStep` interface SHALL include an optional `enrichContext` method with the signature:

```ts
enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;
```

This method is async and MAY perform I/O (unlike `buildMessage` which is pure). When defined, the adapter SHALL call `enrichContext` before `buildMessage` and replace `stepCtx.dynamicContext` with the returned value. When absent, the adapter SHALL skip enrichment and use the original `dynamicContext` as-is.

`enrichContext` SHALL NOT modify the input `dynamicContext` — it SHALL return a new object (spread + additional fields).

#### Scenario: enrichContext is called before buildMessage in ClaudeCodeRunner

- **WHEN** `ClaudeCodeRunner.run(ctx)` executes an `AgentStep` with `enrichContext` defined
- **THEN** `step.enrichContext(dynamicContext, cwd, slug)` is called before `step.buildMessage(state, stepCtx)`
- **AND** `stepCtx.dynamicContext` is replaced with the returned value

#### Scenario: enrichContext is called before buildMessage in ManagedAgentRunner

- **WHEN** `ManagedAgentRunner.runPollingStyle()` executes an `AgentStep` with `enrichContext` defined
- **THEN** `step.enrichContext(dynamicContext, cwd, slug)` is called before `step.buildMessage(state, stepCtx)`
- **AND** `stepCtx.dynamicContext` is replaced with the returned value

#### Scenario: enrichContext absent does not affect existing behavior

- **GIVEN** an `AgentStep` without `enrichContext` (e.g., `ProposeStep`, `ImplementerStep`)
- **WHEN** the adapter executes the step
- **THEN** `buildMessage` receives the original `dynamicContext` unchanged
- **AND** no additional I/O is performed

## MODIFIED Requirements

### Requirement: Step is a Declarative Interface

The `AgentStep` type definition SHALL include the optional `enrichContext` method in addition to its existing fields:

```ts
type AgentStep = {
  kind: "agent";
  name: StepName;
  agent: AgentDefinition;
  maxTurns?: number;
  toolHandlers?: Map<string, ToolHandler>;
  buildMessage(state: JobState, deps: StepDeps): string;
  resultFilePath(state: JobState): string | null;
  parseResult(content: string): StepOutcome;
  completionVerdict?: Verdict;
  setsBranch?: boolean;
  /** Optional pre-buildMessage hook. Async; I/O is allowed. Returns enriched DynamicContext. */
  enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;
};
```

All existing fields and semantics are unchanged. `enrichContext` is optional — existing `AgentStep` implementations that do not define it continue to work without modification.

## REMOVED Requirements
