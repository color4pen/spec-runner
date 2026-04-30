## ADDED Requirements

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
