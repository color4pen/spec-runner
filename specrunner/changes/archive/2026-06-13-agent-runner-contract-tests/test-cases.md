# Test Cases: AgentRunner Contract Tests

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 12
- **Manual**: 2
- **Priority**: must: 13, should: 1, could: 0

---

### TC-001: claude-code adapter injects resumePrompt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePrompt is included in the main-turn prompt > Scenario: claude-code adapter injects resumePrompt

---

### TC-002: codex adapter injects resumePrompt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePrompt is included in the main-turn prompt > Scenario: codex adapter injects resumePrompt

---

### TC-003: claude-code adapter captures toolResult via MCP handler

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reportTool result is collected and returned > Scenario: claude-code adapter captures toolResult via MCP handler

---

### TC-004: codex adapter extracts toolResult from finalResponse JSON

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reportTool result is collected and returned > Scenario: codex adapter extracts toolResult from finalResponse JSON

---

### TC-005: claude-code adapter retries on transient SDK throw

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: transient errors trigger retry and emit step:retry > Scenario: claude-code adapter retries on transient SDK throw

---

### TC-006: codex adapter retries on transient SDK throw

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: transient errors trigger retry and emit step:retry > Scenario: codex adapter retries on transient SDK throw

---

### TC-007: claude-code adapter writes to logPath

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: logPath causes JSONL output to be written > Scenario: claude-code adapter writes to logPath

---

### TC-008: codex adapter writes to logPath

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: logPath causes JSONL output to be written > Scenario: codex adapter writes to logPath

---

### TC-009: claude-code adapter executes postWorkPrompts

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: postWorkPrompts causes additional SDK invocations > Scenario: claude-code adapter executes postWorkPrompts

---

### TC-010: codex adapter executes postWorkPrompts

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: postWorkPrompts causes additional SDK invocations > Scenario: codex adapter executes postWorkPrompts

---

### TC-011: completeness gate fires on unregistered local adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all local adapters are registered in the contract suite > Scenario: completeness gate fires on unregistered local adapter

---

### TC-012: managed-agent is not present in REGISTERED_LOCAL_RUNNERS

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: managed-agent adapter is permanently excluded

**GIVEN** `REGISTERED_LOCAL_RUNNERS` is defined in `agent-runner-contracts.test.ts`
**WHEN** its keys are inspected
**THEN** `"managed-agent"` is not a key, and `"managed-agent"` is present in the `NON_LOCAL_DIRS` exclusion set used by the completeness scan

---

### TC-013: typecheck exits 0 with no type errors

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `agent-runner-contracts.test.ts` has been created and imports are resolved
**WHEN** `bun run typecheck` is executed
**THEN** the command exits 0 with no TypeScript errors

---

### TC-014: full test suite remains green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** the contract test file exists and all fixtures are wired correctly
**WHEN** `bun run test` is executed (full suite)
**THEN** all tests pass including the 10 contract tests, the completeness gate, and all pre-existing tests

---

## Result

```yaml
result: completed
total: 14
automated: 12
manual: 2
must: 13
should: 1
could: 0
blocked_reasons: []
```
