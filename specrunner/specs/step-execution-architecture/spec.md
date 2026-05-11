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
  maxTurns?: number;            // SDK query() maxTurns override (default: 30)
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

`StepDeps` is an alias for `StepContext` (the minimal interface containing `config`, `slug`, `cwd?`, `request`, `repo`). Step methods SHALL NOT receive `PipelineDeps` directly.

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

#### Scenario: AgentStep declares maxTurns
- **GIVEN** any concrete `AgentStep` implementation
- **WHEN** `step.maxTurns` is inspected at runtime
- **THEN** the value is a positive integer or undefined (in which case the executor uses 30 as default)

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

### Requirement: StepExecutor Manages Lifecycle and Emits Events

A `StepExecutor` class SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching
4. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
5. On success: parse verdict from `resultContent` via `step.parseResult` (or derive verdict from `step.completionVerdict` when `resultContent` is null; if `completionVerdict` is also undefined, fall back to `"escalation"`)
6. Emit `verdict:parsed`
7. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
8. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
9. Emit `step:complete` on success or `step:error` on failure

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

`StepExecutor` SHALL accept its dependencies (`EventBus`, `AgentRunner`) via constructor injection. `StepExecutor` MUST NOT directly depend on `SessionClient`, `GitHubClient` (for agent step result fetching), `@anthropic-ai/sdk`, or `@anthropic-ai/claude-code` — all runtime-specific concerns are mediated by the `AgentRunner` port. `GitHubClient` injection remains permitted for `CliStep` paths (e.g., pr-create). `StepExecutor` MUST NOT contain a `STEP_AGENT_ROLE` lookup table or any equivalent intermediate role-mapping; the role is read from `step.agent.role` directly inside the `AgentRunner` adapter (no longer in `StepExecutor`). `StepExecutor` MUST NOT contain hardcoded step-name branches (e.g., `if (step.name === "verification")`); the only allowed dispatch is on `step.kind`. Helper functions within `StepExecutor` (e.g., `runPollingStyleStep`) MUST also contain no hardcoded step-name literals; grep for step-name string literals (e.g., `"spec-review"`, `"verification"`) in `executor.ts` MUST return zero matches.

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
- **GIVEN** an agent step that completes successfully via `AgentRunner.run`
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no `step:error` event is emitted

#### Scenario: CliStep lifecycle events fire in order
- **GIVEN** a CLI step that completes successfully
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** Anthropic SessionClient.create is NOT called
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
- **WHEN** an exception is raised during the step lifecycle (either kind), or `runner.run` resolves with `completionReason !== "success"`
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
- `agent.model` SHALL equal `"claude-opus-4-6[1m]"`
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
- **THEN** the value contains `name: "specrunner-code-review"`, `role: "code-review"`, `model: "claude-opus-4-6[1m]"`, `system` populated from `CODE_REVIEW_SYSTEM_PROMPT`, and `tools: "agent_toolset_20260401"`
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
- `agent.model` SHALL equal `"claude-sonnet-4-6"`
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

### Requirement: AgentStep declares maxTurns for SDK query invocation
The `AgentStep` interface SHALL include an optional `maxTurns?: number` field. When present, `ClaudeCodeRunner` SHALL pass this value to the SDK `query()` call. When absent, the default of 30 SHALL be used.

#### Scenario: maxTurns is passed to SDK query
- **WHEN** `ClaudeCodeRunner.run()` invokes `query()` for an `AgentStep` with `maxTurns: 60`
- **THEN** the `options.maxTurns` parameter passed to `query()` is `60`

#### Scenario: maxTurns defaults to 30 when omitted
- **WHEN** `ClaudeCodeRunner.run()` invokes `query()` for an `AgentStep` without `maxTurns`
- **THEN** the `options.maxTurns` parameter passed to `query()` is `30`

#### Scenario: maxTurns is declared per step
- **WHEN** inspecting each `AgentStep` instance
- **THEN** the following `maxTurns` values are set:
  - propose: 20
  - spec-review: 15
  - spec-fixer: 25
  - implementer: 60
  - build-fixer: 35
  - code-review: 20
  - code-fixer: 30

### Requirement: Step model selection follows opusplan pattern
Each `AgentStep` SHALL declare its `agent.model` based on the step's nature: design and review steps use `claude-opus-4-6[1m]`, implementation and fixer steps use `claude-sonnet-4-6`.

#### Scenario: Design and review steps use Opus
- **WHEN** inspecting the `agent.model` of `ProposeStep`, `SpecReviewStep`, and `CodeReviewStep`
- **THEN** all three have `agent.model === "claude-opus-4-6[1m]"`

#### Scenario: Implementation and fixer steps use Sonnet
- **WHEN** inspecting the `agent.model` of `SpecFixerStep`, `ImplementerStep`, `BuildFixerStep`, and `CodeFixerStep`
- **THEN** all four have `agent.model === "claude-sonnet-4-6"`

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

