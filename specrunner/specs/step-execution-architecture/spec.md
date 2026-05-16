# step-execution-architecture Specification

## Purpose
TBD - created by archiving change 2026-04-29-step-abstraction-refactor. Update Purpose after archive.
## Requirements

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

`StepExecutor` SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching
4. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
5. **[NEW] For local runtime: call `commitAndPush(step, state, deps)` to stage, commit, and push agent-written files**
6. On success: parse verdict from `resultContent` via `step.parseResult` (or derive verdict from `step.completionVerdict` when `resultContent` is null; if `completionVerdict` is also undefined, fall back to `"escalation"`)
7. Emit `verdict:parsed`
8. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
9. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
10. Emit `step:complete` on success or `step:error` on failure

The `commitAndPush` step (step 5) SHALL only execute when the runtime configuration is `"local"`. For `"managed"` runtime, step 5 SHALL be skipped. All other lifecycle steps remain unchanged.

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution. This dependency is used exclusively by `commitAndPush` and SHALL NOT affect the existing `EventBus` and `AgentRunner` constructor parameters.

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
}
```

`PipelineDeps` SHALL extend `StepContext`, adding runtime-specific fields (`client`, `githubClient`, `sleepFn`) that are NOT visible to Step implementations.

`src/core/step/types.ts` SHALL redefine `StepDeps` as an alias for `StepContext` (not `PipelineDeps`):

```ts
export type StepDeps = StepContext;
```

All Step method signatures (`buildMessage(state, deps)`, `resultFilePath(state, deps)`, `parseResult(content, deps)`, `run(state, deps)`) continue to accept `StepDeps` as the second parameter. Because `PipelineDeps extends StepContext`, callers passing `PipelineDeps` remain type-compatible.

Repository origin information (owner/name) is NOT part of `StepContext`. Steps that need repository identity SHALL read it from `state.repository` (the persisted `JobState.repository` field populated at preflight) or invoke `git remote get-url origin` directly from `cwd`. AI prompts SHALL NOT include repository identity as a context variable (the previous `Repository: <owner>/<name>` line in spec-review prompt has been removed; spec-review operates correctly without it).

#### Scenario: StepContext contains only step-relevant fields

- **WHEN** `StepContext` is inspected
- **THEN** it contains exactly: `config`, `slug`, `cwd?`, `request`
- **AND** it does NOT contain `repo`, `client`, `githubClient`, or `sleepFn`

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
- **THEN** the deps object contains only `StepContext` fields (`config`, `slug`, `cwd`, `request`)
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

### Requirement: StepExecutor performs commitAndPush after agent step completion (local runtime)

`StepExecutor` SHALL perform `commitAndPush` after a successful `runner.run()` call and before `finalizeStep()`, but only when the runtime is `"local"`. For managed runtime, this step SHALL be skipped entirely.

The `commitAndPush` sequence SHALL be:

1. `git add -A` in the step's working directory (`deps.cwd`)
2. `git diff --cached --quiet` to detect staged changes (exit code 1 = changes exist, exit code 0 = no changes)
3. If no staged changes AND `step.requiresCommit === true`: throw `NO_COMMIT_DETECTED` error
4. If no staged changes AND `step.requiresCommit` is falsy: return silently (no commit, no error)
5. `git commit -m "${step.name}: ${deps.slug}"` to commit staged changes
6. `git push origin ${state.branch}` to push to remote
7. On push failure: wait 5 seconds, retry push once
8. On second push failure: throw `PUSH_FAILED` error with diagnostic information, record in state for escalation

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution, defaulting to `node:child_process.spawn`.

The `commitAndPush` method SHALL be a private method of `StepExecutor`. It SHALL NOT be exposed on the public API.

#### Scenario: Agent step produces changes and commitAndPush succeeds

- **GIVEN** an agent step completes successfully via `runner.run()` under local runtime
- **AND** the agent wrote files to the worktree
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 1 (changes exist)
- **AND** `git commit -m "implementer: my-slug"` is called
- **AND** `git push origin feat/my-slug-abcdef01` is called
- **AND** `finalizeStep` is called after commitAndPush completes

#### Scenario: No staged changes with requiresCommit true raises error

- **GIVEN** an agent step with `requiresCommit: true` completes under local runtime
- **AND** the agent produced no file changes
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 0 (no changes)
- **AND** a `NO_COMMIT_DETECTED` error is thrown
- **AND** `git commit` is NOT called

#### Scenario: No staged changes with requiresCommit false skips silently

- **GIVEN** an agent step with `requiresCommit` undefined or false completes under local runtime
- **AND** the agent produced no file changes
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 0 (no changes)
- **AND** no error is thrown
- **AND** `git commit` is NOT called
- **AND** `finalizeStep` proceeds normally

#### Scenario: Push failure triggers single retry

- **GIVEN** an agent step completes with changes under local runtime
- **AND** the first `git push` fails (non-zero exit code)
- **WHEN** `StepExecutor` retries push after 5 seconds
- **AND** the second push succeeds
- **THEN** no error is thrown
- **AND** `finalizeStep` proceeds normally

#### Scenario: Push failure after retry raises PUSH_FAILED

- **GIVEN** an agent step completes with changes under local runtime
- **AND** both the first and second `git push` attempts fail
- **WHEN** `StepExecutor` processes the second failure
- **THEN** a `PUSH_FAILED` error is thrown
- **AND** the error is recorded in job state for escalation

#### Scenario: Managed runtime skips commitAndPush entirely

- **GIVEN** an agent step completes successfully under managed runtime
- **WHEN** `StepExecutor.runAgentStep()` proceeds after `runner.run()`
- **THEN** `commitAndPush` is NOT called
- **AND** no `git add`, `git commit`, or `git push` subprocess is spawned
- **AND** `finalizeStep` is called directly

#### Scenario: Commit message follows step-name-colon-slug format

- **GIVEN** an agent step named `"spec-fixer"` with slug `"add-git-commit-to-executor"`
- **WHEN** `commitAndPush` creates the commit
- **THEN** the commit message is `"spec-fixer: add-git-commit-to-executor"`
