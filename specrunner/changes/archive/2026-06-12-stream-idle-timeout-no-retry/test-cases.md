# Test Cases: stream-idle-timeout-no-retry

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 7
- **Manual**: 1
- **Priority**: must: 6, should: 2, could: 0

---

### TC-001: postWorkPrompts follow-up throws SDK transient exception → retried

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Follow-up query turns shall retry on transient errors > Scenario: postWorkPrompts follow-up throws SDK transient exception

---

### TC-002: postWorkPrompts follow-up returns transient error result → retried

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Follow-up query turns shall retry on transient errors > Scenario: postWorkPrompts follow-up returns transient error result

---

### TC-003: report_result follow-up throws SDK transient exception → retried

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Follow-up query turns shall retry on transient errors > Scenario: report_result follow-up throws SDK transient exception

---

### TC-004: step:retry event and transientRetryAttempts recorded on follow-up transient retry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Retry events and counters shall be recorded for follow-up retries > Scenario: step:retry event emitted on follow-up transient retry

---

### TC-005: main work turn transient retry behavior unchanged after the change

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing transient retry coverage shall not regress > Scenario: main work turn transient retry remains unchanged

---

### TC-006: Non-transient error result in postWorkPrompts follow-up is not retried

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Scenario C

**GIVEN** the main work turn succeeds and a postWorkPrompts follow-up turn runs
**WHEN** the follow-up query returns an error result whose `errors[]` content does not match any transient token
**THEN** no retry is attempted, `completionReason` is `"error"`, and `transientRetryAttempts` remains `0`

---

### TC-007: transientRetryAttempts accumulates across main work and follow-up retries

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** the main work turn retries once due to a transient error, then succeeds, and a subsequent postWorkPrompts follow-up turn also retries once due to a transient error before succeeding
**WHEN** the step completes
**THEN** `transientRetryAttempts` in the final `AgentRunResult` equals `2` (one from each phase)

---

### TC-008: typecheck passes with the new runFollowUpQueryWithRetry helper

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 / T-07

**GIVEN** T-02 through T-06 are implemented
**WHEN** `bun run typecheck` is executed
**THEN** the process exits `0` with no type errors

---

## Result

```yaml
result: completed
total: 8
automated: 7
manual: 1
must: 6
should: 2
could: 0
blocked_reasons: []
```
