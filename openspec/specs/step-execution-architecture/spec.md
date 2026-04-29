# step-execution-architecture Specification

## Purpose
TBD - created by archiving change 2026-04-29-step-abstraction-refactor. Update Purpose after archive.
## Requirements
### Requirement: Step is a Declarative Interface
A pipeline step SHALL be expressed as a value implementing the `Step` interface with the following members:

- `name: StepName` — unique identifier
- `agent: AgentDefinition` — the Managed Agent definition this step uses
- `toolHandlers?: Map<string, ToolHandler>` — Custom Tool handlers owned by this step (optional)
- `buildMessage(state: JobState, deps: StepDeps): string` — pure function that produces the user message for the step
- `resultFilePath(state: JobState): string` — path to the artifact the step is expected to produce
- `parseResult(content: string): StepOutcome` — pure function that turns the artifact contents into a verdict

`Step` implementations SHALL NOT manage I/O lifecycle (session creation, polling, persistence, event emission). Lifecycle is the responsibility of `StepExecutor`.

#### Scenario: Step implementation is stateless
- **WHEN** the same `Step` instance is used to execute the same step twice with identical inputs
- **THEN** `buildMessage` / `resultFilePath` / `parseResult` produce identical outputs
- **AND** the `Step` instance does not accumulate state between invocations

#### Scenario: Step exposes its agent definition
- **WHEN** `StepExecutor` needs to bind the step to a Managed Agent
- **THEN** it reads `step.agent` directly
- **AND** it does NOT consult any global agent registry

### Requirement: Custom Tool Spec and Handler Co-located With Step
Custom Tool specifications and their handlers SHALL be owned by the `Step` that uses them. The global tool registry (formerly at `src/core/tools/registry.ts`) SHALL be removed.

#### Scenario: register_branch handler is owned by ProposeStep
- **WHEN** the propose step invokes `register_branch`
- **THEN** `ProposeStep.toolHandlers.get("register_branch")` returns the handler implementation
- **AND** no other step has access to that handler instance

#### Scenario: input_schema for register_branch is unchanged
- **WHEN** `ProposeStep.agent` is bound to a Managed Agent
- **THEN** the Custom Tool definition for `register_branch` has the same `input_schema` JSON as before this change
- **AND** the tool name string `"register_branch"` is unchanged

### Requirement: StepExecutor Manages Lifecycle and Emits Events
A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL be:

1. Emit `step:start`
2. Create a Managed Agents session via `SessionClient`
3. Build and send the prompt using `step.buildMessage`
4. Poll until completion using existing completion-detection logic
5. Fetch the artifact at `step.resultFilePath`
6. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
7. Emit `verdict:parsed`
8. Persist the `StepRun` via `JobStateStore.appendStepRun`
9. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` SHALL accept its dependencies (`SessionClient`, `JobStateStore`, `EventBus`) via constructor injection.

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

