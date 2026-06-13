# Spec: codex-resume-prompt-injection

## Requirements

### Requirement: codex adapter SHALL inject resumePrompt into the main turn prompt

When `ctx.session.resumePrompt` is set, the codex adapter MUST include the value in the main turn prompt wrapped in a `<resume-context>` XML section, using the same format as the claude-code adapter.

#### Scenario: resumePrompt present — judgment reaches the agent

**Given** a codex adapter run where `ctx.session.resumePrompt` is `"Human judgment: accept HIGH finding"`
**When** the main work turn prompt is assembled
**Then** the prompt contains `<resume-context>` with the text `"Human judgment: accept HIGH finding"` inside it

---

### Requirement: codex adapter SHALL NOT alter the prompt when resumePrompt is absent

When `ctx.session.resumePrompt` is `undefined` or empty, the codex adapter MUST produce a main turn prompt identical to its pre-change behavior (no `<resume-context>` section).

#### Scenario: resumePrompt absent — prompt unchanged

**Given** a codex adapter run where `ctx.session.resumePrompt` is `undefined`
**When** the main work turn prompt is assembled
**Then** the prompt does not contain `<resume-context>`
