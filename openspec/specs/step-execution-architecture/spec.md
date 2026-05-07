# step-execution-architecture Specification

## Purpose
TBD - created by archiving change 2026-04-29-step-abstraction-refactor. Update Purpose after archive.
## Requirements
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

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Resolve the runtime Anthropic agent ID from `ConfigStore.getAgentId(step.agent.role)`
3. Create a Managed Agents session via `SessionClient` using the resolved agent ID
4. Build and send the prompt using `step.buildMessage`
5. Poll until completion using existing completion-detection logic
6. Fetch the artifact at `step.resultFilePath` (skip if `null`)
7. Parse the artifact using `step.parseResult` to obtain a `StepOutcome` (or derive `verdict: "success"` when `resultFilePath === null` and session completed cleanly)
8. Emit `verdict:parsed`
9. Persist the `StepRun` via `JobStateStore.appendStepRun`
10. Emit `step:complete` on success or `step:error` on failure

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

### Requirement: spec-review uses a dedicated Anthropic Agent, not the propose Agent

The spec-review step SHALL use an Anthropic Agent that is distinct from the propose Agent. The previous behaviour of mapping `"spec-review"` to the propose Agent ID via a hard-coded role table is MUST removed. This is a structural fix for the system-prompt / user-message mismatch surfaced by PR #22.

#### Scenario: spec-review session uses spec-review agent ID
- **GIVEN** a `SpecReviewStep` instance and a `SpecRunnerConfig` populated by `specrunner init`
- **WHEN** `StepExecutor.execute(specReviewStep, state)` runs
- **THEN** the resolved Anthropic agent ID is `config.agents["spec-review"].agentId`
- **AND** the resolved ID is NOT equal to `config.agents.propose.agentId`

### Requirement: CodeReviewStep is an AgentStep that produces a review verdict

`CodeReviewStep` SHALL be implemented at `src/core/step/code-review.ts` as an `AgentStep` (`kind: "agent"`) with the following invariants:

- `name` SHALL equal `"code-review"`
- `agent.role` SHALL equal `"code-review"`
- `agent.name` SHALL equal `"specrunner-code-review"`
- `agent.model` SHALL equal `"claude-sonnet-4-5"`
- `agent.system` SHALL be the `CODE_REVIEW_SYSTEM_PROMPT` exported from `src/prompts/code-review-system.ts`. The prompt MUST reference the severity / category / verdict / findings format conventions defined in `.claude/rules/review-standards.md` and instruct the agent to perform a read-only review using `git diff main...HEAD` and related spec files.
- `agent.tools` SHALL equal `"agent_toolset_20260401"`
- `agent.capabilities` MUST NOT include `gitWrite` (the step is read-only)
- `resultFilePath(state)` SHALL return `openspec/changes/<slug>/review-feedback-<NNN>.md` where `<NNN>` is the zero-padded 3-digit iteration number for the current cycle
- `parseResult(content)` SHALL extract the verdict via the shared `parseReviewVerdict` helper and return a `StepOutcome` whose `verdict` is one of `"approved" | "needs-fix" | "escalation"`. When the verdict cannot be extracted, it SHALL fall through to the existing parser-failure path (`escalation`).
- `buildMessage(state, deps)` SHALL produce a prompt that (a) names the request slug and base ref, (b) instructs the agent to run `git diff main...HEAD`, (c) instructs the agent to read related spec files under `openspec/changes/<slug>/` and `openspec/specs/`, and (d) instructs the agent to write findings + verdict to the `resultFilePath` using the shared review-feedback format.
- **Invariant**: `buildMessage` SHALL embed `main` as the fixed base ref. The diff command SHALL always be `git diff main...HEAD`. Parameterising the base ref from external state is explicitly out of scope for this change.

#### Scenario: CodeReviewStep exposes a complete AgentDefinition

- **GIVEN** the `CodeReviewStep` instance exported from `src/core/step/code-review.ts`
- **WHEN** `step.agent` is inspected
- **THEN** the value contains `name: "specrunner-code-review"`, `role: "code-review"`, `model: "claude-sonnet-4-5"`, `system` populated from `CODE_REVIEW_SYSTEM_PROMPT`, and `tools: "agent_toolset_20260401"`
- **AND** `step.kind === "agent"`
- **AND** `step.agent.capabilities?.gitWrite` is falsy or the field is absent

#### Scenario: CodeReviewStep.resultFilePath produces zero-padded iteration filename

- **GIVEN** the current code-review iteration number is 1
- **WHEN** `CodeReviewStep.resultFilePath(state)` is invoked
- **THEN** the returned path ends with `review-feedback-001.md`
- **AND** the path is rooted at `openspec/changes/<slug>/`

#### Scenario: CodeReviewStep.parseResult extracts verdict via shared helper

- **GIVEN** a `review-feedback-NNN.md` containing the line `- **verdict**: needs-fix`
- **WHEN** `CodeReviewStep.parseResult(content)` is invoked
- **THEN** the returned `StepOutcome.verdict` equals `"needs-fix"`
- **AND** the parser delegates the extraction to `parseReviewVerdict(content)` (no in-step regex duplication)

### Requirement: CodeFixerStep is an AgentStep that fixes findings and pushes

`CodeFixerStep` SHALL be implemented at `src/core/step/code-fixer.ts` as an `AgentStep` (`kind: "agent"`) with the following invariants:

- `name` SHALL equal `"code-fixer"`
- `agent.role` SHALL equal `"code-fixer"`
- `agent.name` SHALL equal `"specrunner-code-fixer"`
- `agent.model` SHALL equal `"claude-sonnet-4-5"`
- `agent.system` SHALL be the `CODE_FIXER_SYSTEM_PROMPT` exported from `src/prompts/code-fixer-system.ts`. The prompt MUST instruct the agent to (a) implement the HIGH severity findings of `review-feedback-<NNN>.md`, (b) implement MEDIUM severity findings only when consistent with spec/design, (c) ignore LOW severity findings, (d) MUST NOT change spec or add new features, (e) commit and push using the shared git push instruction.
- `agent.tools` SHALL equal `"agent_toolset_20260401"`
- `agent.capabilities.gitWrite` SHALL equal `true`
- `resultFilePath(state)` SHALL return `null` (mirroring spec-fixer / build-fixer)
- `parseResult` SHALL return `NULL_PARSE_RESULT` (the existing constant)
- `buildMessage(state, deps)` SHALL embed the path of the most recent `review-feedback-<NNN>.md` produced by code-review and reuse `buildGitPushInstruction()` to specify the push target branch
- Before constructing the message, `buildMessage` SHALL call `getLatestStepResult(state, "code-review")` and, if the result is absent, SHALL throw `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` to halt execution with a diagnostic error
- The step's `completionVerdict` (the verdict synthesized by `StepExecutor` when `resultFilePath === null` and the session completes cleanly) SHALL be `"approved"`, enabling the `code-fixer --approved→ code-review` transition

#### Scenario: CodeFixerStep exposes gitWrite capability

- **GIVEN** the `CodeFixerStep` instance exported from `src/core/step/code-fixer.ts`
- **WHEN** `step.agent` is inspected
- **THEN** `step.agent.capabilities.gitWrite === true`
- **AND** `step.agent.role === "code-fixer"`
- **AND** `step.kind === "agent"`

#### Scenario: CodeFixerStep.resultFilePath returns null

- **GIVEN** the `CodeFixerStep` instance
- **WHEN** `CodeFixerStep.resultFilePath(state)` is invoked
- **THEN** it returns `null`
- **AND** `CodeFixerStep.parseResult(...)` returns `NULL_PARSE_RESULT`

#### Scenario: CodeFixerStep buildMessage embeds latest review-feedback path

- **GIVEN** code-review has produced `review-feedback-002.md` for the current request
- **WHEN** `CodeFixerStep.buildMessage(state, deps)` is invoked
- **THEN** the produced message string contains the substring `review-feedback-002.md`
- **AND** the message contains the output of `buildGitPushInstruction()` (or an equivalent reuse — the helper MUST be the single source of truth)

### Requirement: parseReviewVerdict is the shared verdict extractor

A pure helper `parseReviewVerdict(content: string): Verdict | null` SHALL be defined at `src/core/parser/review-verdict.ts` and SHALL be the single regex-based extractor used by both `CodeReviewStep.parseResult` and `SpecReviewStep.parseResult` (existing `parseSpecReviewVerdict` SHALL delegate to this helper).

The helper SHALL match the line `- **verdict**: (approved|needs-fix|escalation)` and return the captured literal as a `Verdict`, or `null` when the line is absent. The helper SHALL be pure (no I/O, no side effects).

#### Scenario: parseReviewVerdict extracts approved verdict

- **GIVEN** content containing the line `- **verdict**: approved`
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `"approved"`

#### Scenario: parseReviewVerdict returns null for missing verdict line

- **GIVEN** content with no verdict line
- **WHEN** `parseReviewVerdict(content)` is called
- **THEN** it returns `null`

#### Scenario: SpecReviewStep delegates to parseReviewVerdict

- **GIVEN** the existing `SpecReviewStep.parseResult` (or `parseSpecReviewVerdict` helper) and the new `CodeReviewStep.parseResult`
- **WHEN** both are invoked on identical content `- **verdict**: needs-fix`
- **THEN** both return `"needs-fix"`
- **AND** a unit test SHALL verify that `parseSpecReviewVerdict` calls `parseReviewVerdict` (e.g. via spy / mock or by asserting that both produce identical results for all verdict values and `null`), ensuring `parseReviewVerdict` is the single verdict-extraction entry point

### Requirement: PrCreateStep is a CliStep with no agent and no retry

`PrCreateStep` SHALL be implemented at `src/core/step/pr-create.ts` as a `CliStep` (`kind: "cli"`) with the following invariants:

- `name` SHALL equal `"pr-create"`
- The step SHALL NOT have an `agent` field (per the `CliStep` contract; the lifecycle distinction is governed solely by `kind`)
- `resultFilePath(state)` SHALL return `openspec/changes/<slug>/pr-create-result.md`
- `parseResult(content)` SHALL return a `StepOutcome` whose `verdict` is one of `"success"` (when the result file contains `## Status: success`) or `"error"` (when it contains `## Status: failed`). When neither marker is present, `parseResult` SHALL return `{ verdict: null, ... }` and `StepExecutor` SHALL normalize the verdict to `"escalation"` (existing rule for CLI steps with null verdict)
- `run(state, deps)` SHALL invoke `runPrCreate` from `src/core/pr-create/runner.ts`, persist the resulting `pullRequest` via `JobStateStore` on success, and write `pr-create-result.md` before returning
- `run` SHALL NOT contain a retry loop. Any single gh CLI failure SHALL surface as `Status: failed` and trigger the `pr-create --error→ escalate` transition. The pipeline is idempotent across re-runs because the runner detects existing OPEN PRs

#### Scenario: PrCreateStep.kind is "cli" and has no agent field

- **GIVEN** the `PrCreateStep` instance exported from `src/core/step/pr-create.ts`
- **WHEN** the step is inspected
- **THEN** `step.kind === "cli"`
- **AND** the step has no `agent` property
- **AND** `step.run` is a function returning `Promise<void>`

#### Scenario: PrCreateStep.parseResult maps Status markers to verdicts

- **GIVEN** content `## Status: success\n...`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === "success"`

- **GIVEN** content `## Status: failed\n...`
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === "error"`

- **GIVEN** content with no `## Status:` line
- **WHEN** `PrCreateStep.parseResult(content)` is invoked
- **THEN** `outcome.verdict === null`
- **AND** `StepExecutor` normalizes the persisted `StepRun.outcome.verdict` to `"escalation"`

### Requirement: StepExecutor handles pr-create like other CliSteps

`StepExecutor` SHALL execute `PrCreateStep` via the same `kind: "cli"` lifecycle path used by `VerificationStep`:

1. Emit `step:start`
2. Skip session creation, agent ID resolution, and `buildMessage` invocation
3. Invoke `step.run(state, deps)` and `await` its completion
4. Fetch the artifact at `step.resultFilePath`
5. Parse the artifact using `step.parseResult` to obtain a `StepOutcome`
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun`
8. Emit `step:complete` on success or `step:error` on failure

`StepExecutor` MUST NOT contain a hardcoded branch for `step.name === "pr-create"`. Dispatch SHALL remain on `step.kind` only (existing invariant).

#### Scenario: pr-create lifecycle events fire in order

- **GIVEN** `PrCreateStep` runs successfully
- **WHEN** `StepExecutor.execute(prCreateStep, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** `SessionClient.create` is NOT called (CLI step path)

#### Scenario: StepExecutor dispatch is on kind only after pr-create addition

- **WHEN** `src/core/step/executor.ts` is grepped for `"pr-create"` string literal
- **THEN** zero matches are returned
- **AND** dispatch occurs only on `step.kind`

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

