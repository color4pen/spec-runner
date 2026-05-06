## ADDED Requirements

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
  maxTurns?: number;            // SDK query() maxTurns override (default: 30)
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
