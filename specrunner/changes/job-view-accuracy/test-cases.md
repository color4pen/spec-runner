# Test Cases: job-view-accuracy

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 10
- **Manual**: 1
- **Priority**: must: 7, should: 4, could: 0

---

### TC-001: escalation-sourced interruption with resumePoint returns source step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation source step reflects only the current interruption > Scenario: escalation-sourced interruption with resumePoint

---

### TC-002: timeout-sourced interruption returns null even with prior escalation in history

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation source step reflects only the current interruption > Scenario: timeout-sourced interruption with prior escalation in history

---

### TC-003: iteration-exhaustion interruption returns null even with prior escalation in history

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation source step reflects only the current interruption > Scenario: iteration-exhaustion interruption with prior escalation in history

---

### TC-004: legacy state without resumePoint falls back to history scan

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: legacy state falls back to history scan > Scenario: legacy state without resumePoint shows escalation step

---

### TC-005: two jobs sharing a usage file each see only their own cost

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats cost is scoped to the current job's invocations > Scenario: two jobs share a usage file, each sees only its own cost

---

### TC-006: all-legacy invocations (no jobId) are summed regardless of job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: legacy invocations without jobId are always included > Scenario: usage file contains only jobId-absent invocations

---

### TC-007: mixed legacy and new invocations include both costs for own job

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: legacy invocations without jobId are always included > Scenario: usage file mixes legacy and new invocations

---

### TC-008: resumePoint present but current step has no runs returns null

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > TC-033

**GIVEN** a state with `resumePoint = { step: "spec-review", reason: "...", iterationsExhausted: 0 }` and `steps = {}` (no entry for `"spec-review"`)
**WHEN** `deriveEscalationSourceStep` is called
**THEN** the function returns `null` (no runs exist for the step, cannot be escalation-sourced)

---

### TC-009: usage file with only foreign-jobId invocations yields null cost

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > TC-S04

**GIVEN** a `UsageFile` containing one invocation with `jobId = "job-B"` (cost-producing modelUsage), and a job state with `jobId = "job-A"`
**WHEN** `deriveRunStat(stateA, usageFile)` is called
**THEN** `costUsd` is `null` (the only invocation is excluded after jobId filter; no priced data remains)

---

### TC-010: typecheck and test pass with no regressions

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** the repository after applying changes in T-01 through T-04
**WHEN** `bun run typecheck` and `bun run test` are executed in the repository root
**THEN** both commands exit with code 0 and no errors are reported

---

### TC-011: pre-existing deriveEscalationSourceStep tests remain green without modification

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria (regression guard)

**GIVEN** the existing test cases TC-016, TC-017, TC-018, TC-004, TC-005 in `src/core/job-list/__tests__/operations-view.test.ts`, unchanged
**WHEN** `bun run test` is executed
**THEN** all pre-existing test cases pass without modification

---

## Result

```yaml
result: completed
total: 11
automated: 10
manual: 1
must: 7
should: 4
could: 0
blocked_reasons: []
```
