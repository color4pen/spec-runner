# Spec: Codex provider scope discipline guidance

## Requirements

### Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt

The Codex adapter SHALL append a fixed scope discipline guidance section to the main work turn
prompt of every agent step it executes. The guidance MUST be injected unconditionally — it does
not depend on the step name, the reviewer name, the request type, the presence of a report tool,
project rules, artifacts, touched files, or a resume context.

The guidance text SHALL be exactly:

```text
SpecRunner execution guidance:

- Do not invent requirements beyond the supplied request/spec/reviewer criteria.
- Prioritize issues that materially affect correctness or normal supported execution.
- Do not promote merely theoretical, extremely unlikely, or speculative edge cases to blocking findings.
- A finding must explain the concrete user/runtime impact that justifies changing the implementation.
- If an issue is technically possible but does not justify blocking completion, report it as an observation or omit it.
- Do not broaden the scope in order to make the implementation more defensive or general.
```

#### Scenario: guidance appears in a Codex reviewer step prompt

**Given** a Codex agent runner configured with a review-type agent step and no project rules
**When** the runner executes the step and issues the main work turn
**Then** the prompt passed to the Codex thread contains the guidance text exactly as specified

#### Scenario: guidance appears in a Codex producer step prompt

**Given** a Codex agent runner configured with a producer-type agent step (for example `implementer`)
**When** the runner executes the step and issues the main work turn
**Then** the prompt passed to the Codex thread contains the same guidance text as for a reviewer step

#### Scenario: guidance appears when the step has no report tool

**Given** a Codex agent runner whose run context has no `reportTool` in its policy
**When** the runner executes the step and issues the main work turn
**Then** the prompt contains the guidance text and does not contain the completion report instruction

#### Scenario: guidance appears when the session is resumed

**Given** a Codex agent runner whose run context carries a resume session id and a resume prompt
**When** the runner resumes the thread and issues the main work turn
**Then** the prompt contains both the resume context and the guidance text

### Requirement: Guidance is positioned after project rules and before the completion report instruction

The Codex adapter SHALL place the guidance section after the base message, artifacts, touched
files, resume context, runtime instructions and project rules, and before the completion report
instruction, so that the completion report instruction remains the final directive of the prompt.

#### Scenario: ordering with project rules and a report tool

**Given** a Codex run context that has both `promptRules` and a `reportTool`
**When** the runner issues the main work turn
**Then** the guidance text appears after the project rules text and before the completion report instruction in the prompt string

#### Scenario: guidance is the tail of the prompt when no report tool is configured

**Given** a Codex run context with no `reportTool` and no `promptRules`, running in a working
directory with no change folder artifacts and no touched files and no resume prompt
**When** the runner issues the main work turn
**Then** the prompt equals the base message followed by the runtime instructions followed by the guidance section, with no other section present

### Requirement: Follow-up turns do not repeat the guidance

The Codex adapter MUST NOT re-inject the guidance text into completion retry prompts, post-work
prompts, or output-verification repair prompts, because those turns run on the same Codex thread
and already carry the main turn context.

#### Scenario: completion retry prompt carries no guidance

**Given** a Codex run context with a `reportTool` whose main turn response cannot be parsed as JSON
**When** the adapter issues the completion retry turn
**Then** the retry prompt does not contain the guidance text

### Requirement: Non-Codex providers are unaffected by the guidance

The guidance text and the module that defines it SHALL be referenced only from within the Codex
adapter. No file outside the Codex adapter directory — in particular the shared prompt builder,
the Claude Code adapter, and the managed agent adapter — MUST contain or import the guidance.

#### Scenario: guidance is not referenced outside the Codex adapter

**Given** the production sources under `src/`
**When** every non-test TypeScript file outside `src/adapter/codex/` is scanned
**Then** none of them contains the guidance marker text or an import of the guidance module

#### Scenario: shared prompt builder output is unchanged

**Given** a run context used by both the Claude Code adapter and the Codex adapter
**When** `buildAdditionalInstructions` and `buildResumeSection` are invoked
**Then** their returned strings contain no guidance text

### Requirement: The guidance is a single-source adapter-local constant

The guidance text SHALL be defined once as an exported constant inside the Codex adapter and
consumed by both the prompt assembly and its tests. The change MUST NOT introduce a provider
configuration protocol, a policy field, or any pipeline abstraction to carry it, and MUST NOT
alter pipeline transitions, convergence budget, `maxIterations`, or reviewer definitions under
`specrunner/reviewers/`.

#### Scenario: tests assert against the exported constant

**Given** the Codex adapter prompt injection unit tests
**When** they assert that the prompt contains the guidance
**Then** they import the guidance constant from the adapter module rather than restating the text as a literal

#### Scenario: no pipeline or reviewer files change

**Given** the diff of this change against the base branch
**When** the changed file list is inspected
**Then** it contains no file under `src/core/pipeline/` and no file under `specrunner/reviewers/`
