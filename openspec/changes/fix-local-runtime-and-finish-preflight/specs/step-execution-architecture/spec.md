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
  resultFilePath(state: JobState): string | null;
  parseResult(content: string): StepOutcome;
  completionVerdict?: Verdict;  // verdict when resultFilePath is null and session completes
  setsBranch?: boolean;         // if true, executor sets state.branch after successful completion
};

type CliStep = {
  kind: "cli";
  name: StepName;
  resultFilePath(state: JobState): string;
  parseResult(content: string): StepOutcome;
  run(state: JobState, deps: StepDeps): Promise<void>;  // direct CLI execution
};
```

`Step` implementations SHALL NOT manage I/O lifecycle (session creation, polling, persistence, event emission). Lifecycle is the responsibility of `StepExecutor`.

`AgentStep` implementations MUST own the full `AgentDefinition` value (system prompt, model, tools). The Anthropic agent ID itself is resolved at runtime from `ConfigStore` keyed by `step.agent.role`.

`CliStep` implementations MUST NOT have an `agent` field. The lifecycle distinction is governed solely by the `kind` discriminator (no implicit data-presence inference).

`AgentStep.completionVerdict` is an optional field declaring the verdict to record when `resultFilePath` returns `null` and the session (or local runtime execution) completes successfully. If omitted, the default behavior depends on the runtime path (see StepExecutor requirement).

`AgentStep.setsBranch` is an optional boolean flag. When `true`, `StepExecutor` SHALL set `state.branch` after successful completion of the step in the local runtime path, provided `state.branch` is not already set. The branch name SHALL be derived as `feat/${slug}`. This flag replaces any step-name-based branch detection logic (e.g., `if (step.name === "propose")`).

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
- **AND** the value has a `run(state, deps): Promise<void>` method

#### Scenario: ProposeStep declares setsBranch and completionVerdict
- **GIVEN** the `ProposeStep` instance exported from `src/core/step/propose.ts`
- **WHEN** `step` is inspected at runtime
- **THEN** `step.setsBranch === true`
- **AND** `step.completionVerdict === "success"`

### Requirement: StepExecutor Manages Lifecycle and Emits Events

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Resolve the runtime Anthropic agent ID from `ConfigStore.getAgentId(step.agent.role)`
3. Create a Managed Agents session via `SessionClient` using the resolved agent ID
4. Build and send the prompt using `step.buildMessage`
5. Poll until completion using existing completion-detection logic
6. Fetch the artifact at `step.resultFilePath` (skip if `null`)
7. Parse the artifact using `step.parseResult` to obtain a `StepOutcome` (or derive verdict from `step.completionVerdict` when `resultFilePath === null` and session completed cleanly; if `completionVerdict` is also undefined, fall back to `"escalation"`)
8. Emit `verdict:parsed`
9. Persist the `StepRun` via `JobStateStore.appendStepRun`
10. Emit `step:complete` on success or `step:error` on failure

For the local runtime path (AgentRunner returns without `_updatedState`):

- When `resultContent === null` and `step.completionVerdict` is defined, the executor SHALL use `step.completionVerdict` as the verdict instead of falling back to `"escalation"`.
- When `resultContent === null` and `step.completionVerdict` is undefined, the executor SHALL fall back to `"escalation"` (existing behavior).
- When `step.setsBranch === true` and `jobState.branch` is falsy, the executor SHALL set `state.branch = "feat/${slug}"` after successful verdict resolution. The slug SHALL be obtained from `deps.slug`.

For `kind: "cli"` steps:

1. Emit `step:start`
2. Skip session creation, agent ID resolution, and `buildMessage` invocation
3. Invoke `step.run(state, deps)` and `await` its completion
4. Fetch the artifact at `step.resultFilePath`
5. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun`
8. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` SHALL accept its dependencies (`SessionClient`, `JobStateStore`, `EventBus`, `ConfigStore`) via constructor injection. `StepExecutor` MUST NOT contain a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate role-mapping; the role is read from `step.agent.role` directly. `StepExecutor` MUST NOT contain hardcoded step-name branches (e.g., `if (step.name === "verification")`); the only allowed dispatch is on `step.kind`. Helper functions within `StepExecutor` (e.g., `runPollingStyleStep`) MUST also contain no hardcoded step-name literals; grep for step-name string literals (e.g., `"spec-review"`, `"verification"`) in `executor.ts` MUST return zero matches.

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

#### Scenario: Local runtime completionVerdict fallback
- **GIVEN** an AgentStep with `resultFilePath === null` and `completionVerdict: "success"` (e.g., ProposeStep)
- **WHEN** the local runtime adapter returns `resultContent === null` and `completionReason === "success"`
- **THEN** the executor uses `step.completionVerdict` ("success") as the verdict
- **AND** the executor does NOT emit a "Treating as escalation" warning

#### Scenario: Local runtime completionVerdict undefined fallback
- **GIVEN** an AgentStep with `resultFilePath === null` and `completionVerdict` undefined
- **WHEN** the local runtime adapter returns `resultContent === null` and `completionReason === "success"`
- **THEN** the executor falls back to `"escalation"` as the verdict
- **AND** the executor emits a "Treating as escalation" warning

#### Scenario: Local runtime setsBranch after propose
- **GIVEN** an AgentStep with `setsBranch: true` (e.g., ProposeStep)
- **AND** `jobState.branch` is undefined or empty
- **WHEN** the local runtime path completes successfully
- **THEN** `state.branch` is set to `"feat/${slug}"` where slug comes from `deps.slug`

#### Scenario: setsBranch does not overwrite existing branch
- **GIVEN** an AgentStep with `setsBranch: true`
- **AND** `jobState.branch` is already set to `"fix/existing-branch"`
- **WHEN** the local runtime path completes successfully
- **THEN** `state.branch` remains `"fix/existing-branch"` (not overwritten)

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

### Requirement: parseReviewVerdict is the shared verdict extractor

A pure helper `parseReviewVerdict(content: string): Verdict | null` SHALL be defined at `src/core/parser/review-verdict.ts` and SHALL be the single regex-based extractor used by both `CodeReviewStep.parseResult` and `SpecReviewStep.parseResult` (existing `parseSpecReviewVerdict` SHALL delegate to this helper).

The helper SHALL match verdict lines in the following formats (case-insensitive):
- `- **verdict**: approved` (original format)
- `**Verdict**: approved` (capitalized, no `- ` prefix)
- `Verdict: approved` (no bold markup)
- `- verdict: approved` (no bold markup, with `- ` prefix)

The helper SHALL return the captured literal (lowercased to match `Verdict` type) as one of `"approved" | "needs-fix" | "escalation"`, or `null` when no matching line is found. The helper SHALL be pure (no I/O, no side effects).

#### Scenario: parseReviewVerdict extracts approved verdict
- **GIVEN** content containing the line `- **verdict**: approved`
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `"approved"`

#### Scenario: parseReviewVerdict handles capitalized Verdict
- **GIVEN** content containing the line `**Verdict**: needs-fix`
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `"needs-fix"`

#### Scenario: parseReviewVerdict handles plain text format
- **GIVEN** content containing the line `Verdict: escalation`
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `"escalation"`

#### Scenario: parseReviewVerdict returns null for missing verdict line
- **GIVEN** content with no verdict line
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `null`

#### Scenario: SpecReviewStep delegates to parseReviewVerdict
- **GIVEN** the existing `SpecReviewStep.parseResult` (or `parseSpecReviewVerdict` helper) and the new `CodeReviewStep.parseResult`
- **WHEN** both are invoked on identical content `- **verdict**: needs-fix`
- **THEN** both return `"needs-fix"`
- **AND** a unit test SHALL verify that `parseSpecReviewVerdict` calls `parseReviewVerdict` (e.g. via spy / mock or by asserting that both produce identical results for all verdict values and `null`), ensuring `parseReviewVerdict` is the single verdict-extraction entry point
