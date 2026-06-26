# Test Cases: resume-from-progress

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 11, should: 1, could: 0

---

### TC-001: Hard-crash job resumes from state.step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume step resolution SHALL fall back to state.step when resumePoint is absent > Scenario: Hard-crash job resumes from state.step

---

### TC-002: Job with no progress cannot be resumed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume step resolution SHALL fall back to state.step when resumePoint is absent > Scenario: Job with no progress cannot be resumed

---

### TC-003: Normal escalation resume uses resumePoint

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing resumePoint-based resume SHALL be unaffected > Scenario: Normal escalation resume uses resumePoint

---

### TC-004: Inbox recovers stale running job with no resumePoint in one cycle

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Inbox auto-recovery SHALL succeed for stale running jobs without resumePoint > Scenario: Inbox recovers stale running job with no resumePoint in one cycle

---

### TC-005: resolveResumeStep returns stateStep when --from and resumePoint are both absent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (AC1)

**GIVEN** `resolveResumeStep` is called with `from=undefined`, `resumePoint=null`, and `stateStep="design"`
**WHEN** the function executes the resolution chain
**THEN** `"design"` is returned (stateStep fallback path, priority 4)

---

### TC-006: resolveResumeStep throws when stateStep is "init"

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (AC2)

**GIVEN** `resolveResumeStep` is called with `from=undefined`, `resumePoint=null`, and `stateStep="init"`
**WHEN** the function checks `ALL_STEP_NAMES_SET.has("init")`
**THEN** the set check returns false, the stateStep fallback is skipped, and the function throws "Cannot resolve resume step: no --from, no resumePoint, and no progress recorded"

---

### TC-007: resolveResumeStep throws when stateStep is undefined

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (AC2)

**GIVEN** `resolveResumeStep` is called with `from=undefined`, `resumePoint=null`, and `stateStep=undefined`
**WHEN** the function exhausts all resolution options
**THEN** the function throws "Cannot resolve resume step: no --from, no resumePoint, and no progress recorded"

---

### TC-008: resolveResumeStep prefers resumePoint.step over stateStep

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (AC3)

**GIVEN** `resolveResumeStep` is called with `from=undefined`, a non-null `resumePoint` with `step="spec-review"`, and `stateStep="design"`
**WHEN** the function evaluates priority 3 (resumePoint present)
**THEN** `"spec-review"` is returned and `stateStep` is never consulted

---

### TC-009: resolveResumeStep prefers --from over resumePoint and stateStep

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (--from regression)

**GIVEN** `resolveResumeStep` is called with `from="implementer"`, a non-null `resumePoint` with `step="spec-review"`, and `stateStep="design"`
**WHEN** the function evaluates priority 1 (from is a valid step name)
**THEN** `"implementer"` is returned; resumePoint and stateStep are ignored

---

### TC-010: resolveResumeStep throws with step list when --from is an invalid step name

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria (existing error path unchanged)

**GIVEN** `resolveResumeStep` is called with `from="nonexistent-step"`, any `resumePoint`, and any `stateStep`
**WHEN** the function checks `ALL_STEP_NAMES_SET.has("nonexistent-step")` at priority 2
**THEN** the function throws an `Invalid --from value` error that includes the list of available step names

---

### TC-011: resume.ts preguard is removed and state.step is forwarded to resolveResumeStep

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a job with `status=running`, `step="design"`, `resumePoint=null`, and a dead PID is loaded by `ResumeCommand`
**WHEN** `ResumeCommand.execute()` runs through the stale-running recovery and reaches `resolveResumeStep`
**THEN** the old guard at resume.ts:163-166 does not throw; `resolveResumeStep` receives `state.step="design"` as its third argument and returns `"design"` as `startStep`

---

### TC-012: typecheck and full test suite pass after changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** all source changes from T-01 through T-05 are applied
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** typecheck reports 0 errors and the test runner reports 0 failed tests

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 11
should: 1
could: 0
blocked_reasons: []
```
