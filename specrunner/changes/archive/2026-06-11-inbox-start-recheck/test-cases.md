# Test Cases: inbox-start-recheck

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 5, should: 4, could: 0

---

### TC-001: concurrent tick links issue before second start executes

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: issue linkage SHALL be re-checked immediately before each start is executed > Scenario: issue linked by a concurrent tick before the second start executes

---

### TC-002: issue not yet linked when start executes

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: issue linkage SHALL be re-checked immediately before each start is executed > Scenario: issue not yet linked when start executes

---

### TC-003: skip path does not call startJob

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-03

**GIVEN** `isIssueLinked` is stubbed to resolve `true` for issue #615  
**WHEN** the start loop processes the action for #615  
**THEN** `effects.startJob` is never called

---

### TC-004: skip path does not add to summary.errors

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** `isIssueLinked` resolves `true` for a planned start  
**WHEN** the start loop processes that action  
**THEN** the issue number is absent from both `summary.started` and `summary.errors`

---

### TC-005: warning is written to stderr on skip

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-02

**GIVEN** `isIssueLinked` resolves `true` for issue #615  
**WHEN** the start loop processes that action  
**THEN** `stderrWrite` is called with a message containing `skip: issue#615 already linked`

---

### TC-006: isIssueLinked default returns true when a matching job state exists

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01

**GIVEN** `JobStateStore.list` returns a list that includes a job with `issueNumber === 100`  
**WHEN** the default `isIssueLinked(100)` implementation is invoked  
**THEN** it resolves `true`

---

### TC-007: isIssueLinked default returns false when no matching job state exists

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-01

**GIVEN** `JobStateStore.list` returns a list with no job having `issueNumber === 100`  
**WHEN** the default `isIssueLinked(100)` implementation is invoked  
**THEN** it resolves `false`

---

### TC-008: isIssueLinked override in opts.effects is used instead of the default

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-01

**GIVEN** `opts.effects.isIssueLinked` is provided as a stub  
**WHEN** `buildEffects` merges effects and the loop calls `effects.isIssueLinked`  
**THEN** the stub is invoked (not the default implementation)

---

### TC-009: non-skip path preserves existing error-handling when startJob throws

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-02

**GIVEN** `isIssueLinked` resolves `false` for an issue and `startJob` throws an error  
**WHEN** the start loop processes that action  
**THEN** the error is caught by the existing try/catch and added to `summary.errors` (skip path not taken)

---

## Result

```yaml
result: completed
total: 9
automated: 9
manual: 0
must: 5
should: 4
could: 0
blocked_reasons: []
```
