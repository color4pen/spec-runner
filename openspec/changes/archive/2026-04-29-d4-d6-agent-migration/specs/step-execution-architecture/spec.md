## MODIFIED Requirements

### Requirement: Step is a Declarative Interface

A pipeline step SHALL be expressed as a value implementing the `Step` interface with the following members:

- `name: StepName` — unique identifier
- `agent: AgentDefinition` — the complete Agent definition this step uses (`name`, `role`, `model`, `system`, `tools`, optional `capabilities`). The previous placeholder shape `{ agentId: string }` is removed.
- `toolHandlers?: Map<string, ToolHandler>` — Custom Tool handlers owned by this step (optional)
- `buildMessage(state: JobState, deps: StepDeps): string` — pure function that produces the user message for the step
- `resultFilePath(state: JobState): string` — path to the artifact the step is expected to produce
- `parseResult(content: string): StepOutcome` — pure function that turns the artifact contents into a verdict

`Step` implementations SHALL NOT manage I/O lifecycle (session creation, polling, persistence, event emission). Lifecycle is the responsibility of `StepExecutor`.

`Step` implementations MUST own the full `AgentDefinition` value (system prompt, model, tools). The Anthropic agent ID itself is resolved at runtime from `ConfigStore` keyed by `step.agent.role`.

#### Scenario: Step implementation is stateless
- **WHEN** the same `Step` instance is used to execute the same step twice with identical inputs
- **THEN** `buildMessage` / `resultFilePath` / `parseResult` produce identical outputs
- **AND** the `Step` instance does not accumulate state between invocations

#### Scenario: Step exposes its agent definition
- **WHEN** `StepExecutor` needs to bind the step to a Managed Agent
- **THEN** it reads `step.agent` directly to obtain the full `AgentDefinition`
- **AND** it resolves the runtime Anthropic agent ID via `ConfigStore.getAgentId(step.agent.role)`
- **AND** it does NOT consult any global agent registry from inside `StepExecutor`
- **AND** it does NOT consult a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate map

#### Scenario: Step.agent is a complete AgentDefinition
- **GIVEN** any concrete `Step` implementation (e.g., `ProposeStep`, `SpecReviewStep`, `SpecFixerStep`)
- **WHEN** `step.agent` is inspected at runtime
- **THEN** the value contains `name`, `role`, `model`, `system`, and `tools` fields populated by the step itself
- **AND** the value does NOT contain a `agentId` placeholder field

### Requirement: StepExecutor Manages Lifecycle and Emits Events

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL be:

1. Emit `step:start`
2. Resolve the runtime Anthropic agent ID from `ConfigStore.getAgentId(step.agent.role)`
3. Create a Managed Agents session via `SessionClient` using the resolved agent ID
4. Build and send the prompt using `step.buildMessage`
5. Poll until completion using existing completion-detection logic
6. Fetch the artifact at `step.resultFilePath`
7. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
8. Emit `verdict:parsed`
9. Persist the `StepRun` via `JobStateStore.appendStepRun`
10. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` SHALL accept its dependencies (`SessionClient`, `JobStateStore`, `EventBus`, `ConfigStore`) via constructor injection. `StepExecutor` MUST NOT contain a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate role-mapping; the role is read from `step.agent.role` directly.

#### Scenario: Lifecycle events fire in order
- **GIVEN** a step that completes successfully
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no `step:error` event is emitted

#### Scenario: Error path emits step:error and decorates exception
- **WHEN** an exception is raised during the step lifecycle
- **THEN** `step:error` is emitted with the error payload
- **AND** the exception bubbles up with the `err.state` field attached for upstream consumers
- **AND** `failJobState` and `appendHistory` semantics are preserved verbatim

#### Scenario: Three existing steps reduce to declarative form
- **GIVEN** the prior implementations `propose.ts` (~386 LOC), `spec-review.ts` (~310 LOC), `spec-fixer.ts` (~185 LOC)
- **WHEN** they are migrated to `Step` implementations
- **THEN** each migrated file contains only `buildMessage` / `resultFilePath` / `parseResult` and tool-handler registration
- **AND** each migrated file is approximately 1/3 of its prior LOC
- **AND** the 45–55 LOC duplicate block (session create / try-catch / failJobState / appendHistory / err.state attach) is absent from each step file

#### Scenario: STEP_AGENT_ROLE lookup is removed
- **GIVEN** the source of `src/core/step/executor.ts` after this change
- **WHEN** the file is grepped for `STEP_AGENT_ROLE`
- **THEN** no occurrences are found
- **AND** the executor reads `step.agent.role` directly when resolving the Anthropic agent ID

## ADDED Requirements

### Requirement: spec-review uses a dedicated Anthropic Agent, not the propose Agent

The spec-review step SHALL use an Anthropic Agent that is distinct from the propose Agent. The previous behaviour of mapping `"spec-review"` to the propose Agent ID via a hard-coded role table is MUST removed. This is a structural fix for the system-prompt / user-message mismatch surfaced by PR #22.

#### Scenario: spec-review session uses spec-review agent ID
- **GIVEN** a `SpecReviewStep` instance and a `SpecRunnerConfig` populated by `specrunner init`
- **WHEN** `StepExecutor.execute(specReviewStep, state)` runs
- **THEN** the resolved Anthropic agent ID is `config.agents["spec-review"].agentId`
- **AND** the resolved ID is NOT equal to `config.agents.propose.agentId`
