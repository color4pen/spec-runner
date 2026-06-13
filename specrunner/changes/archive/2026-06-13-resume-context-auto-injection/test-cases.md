# Test Cases: Resume Context Auto Injection

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 7, should: 4, could: 0

---

### TC-001: resume preparation captures the snapshot

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume runs shall preserve a deterministic resume snapshot > Scenario: resume preparation captures the snapshot

---

### TC-002: plain resume after escalation injects automatic context

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The executor shall generate resume context from the snapshot > Scenario: plain resume after escalation

---

### TC-003: resume with human prompt includes automatic context and human prose

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Human resume prose shall supplement automatic context > Scenario: resume with human prompt

---

### TC-004: initial run receives no resume context

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Non-resume runs shall not receive resume context > Scenario: initial run

---

### TC-005: same state produces the same automatic text

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Automatic context shall be deterministic > Scenario: same state produces same text

---

### TC-006: future decision ledger support can extend the builder

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Future state-backed context sections shall have an extension point > Scenario: future decision ledger support

---

### TC-007: builder returns undefined when neither automatic context nor human prompt applies

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-01

**GIVEN** a `JobState` with no matching `resumeContext.resumePoint.step` for the current step and no human resume prompt
**WHEN** the deterministic resume context builder is called
**THEN** it returns `undefined`

---

### TC-008: builder passes through human prompt when automatic context does not qualify

**Category**: unit
**Priority**: should
**Source**: design.md D4 / tasks.md T-01

**GIVEN** a `JobState` with a `resumeContext` snapshot that does not match the current step and a non-empty human resume prompt
**WHEN** the deterministic resume context builder is called
**THEN** it returns the human prompt unchanged

---

### TC-009: automatic context renders attempt, verdict, stop reason, and resume semantics

**Category**: unit
**Priority**: must
**Source**: design.md D2, D5 / tasks.md T-01, T-03

**GIVEN** a `JobState` with prior step runs, a matching `resumeContext.resumePoint.step`, and recorded `resumePoint.reason`, `iterationsExhausted`, and optional `exhaustionPhase`
**WHEN** the deterministic resume context builder is called
**THEN** the output includes the previous attempt number and current attempt number
**AND** it includes the previous verdict
**AND** it includes the stop reason
**AND** it includes `iterationsExhausted`
**AND** it includes `exhaustionPhase` when present
**AND** it states that pre-existing worktree artifacts may come from an earlier attempt and do not prove the current attempt is complete

---

### TC-010: automatic context is deterministic and has no external dependencies

**Category**: unit
**Priority**: must
**Source**: design.md D2, D5 / tasks.md T-01

**GIVEN** identical `JobState`, current step name, snapshot, and human prompt inputs
**WHEN** the deterministic resume context builder is called twice
**THEN** both calls return byte-identical output
**AND** the builder does not read the filesystem, inspect git, consult the clock, call the network, or invoke an LLM

---

### TC-011: executor consumes the composed resume prompt only once

**Category**: integration
**Priority**: should
**Source**: design.md D1, D3 / tasks.md T-02

**GIVEN** a resume run with a qualifying snapshot and an initial human resume prompt
**WHEN** the first agent step builds `AgentRunContext`
**THEN** `ctx.session.resumePrompt` contains the automatic context first and the human prompt after it
**AND** the executor clears `deps.resumePrompt` after that step
**AND** subsequent agent steps do not receive the already-consumed resume prompt

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 7
should: 4
could: 0
blocked_reasons: []
```
