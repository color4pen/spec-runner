# Test Cases:

## Summary

- **Total**: 3 cases
- **Automated** (unit/integration): 3
- **Manual**: 0
- **Priority**: must: 2, should: 1, could: 0

### TC-001: resumePrompt present injects resume context into codex main turn

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL inject resumePrompt into the main turn prompt > Scenario: resumePrompt present — judgment reaches the agent

### TC-002: resumePrompt absent leaves the codex prompt unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL NOT alter the prompt when resumePrompt is absent > Scenario: resumePrompt absent — prompt unchanged

### TC-003: shared resume section helper returns an empty string when no judgment exists

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Add `buildResumeSection` to shared prompt-builder

**GIVEN** a `buildResumeSection(ctx)` call where `ctx.session.resumePrompt` is `undefined` or `""`
**WHEN** the helper is evaluated
**THEN** the helper returns `""`

**GIVEN** a codex prompt assembly path that uses the shared resume section helper
**WHEN** `ctx.session.resumePrompt` is not set
**THEN** the constructed prompt stays byte-identical to the pre-change prompt shape, with no `<resume-context>` section added

## Result
```yaml
result: completed
total: 3
automated: 3
manual: 0
must: 2
should: 1
could: 0
blocked_reasons: []
```
