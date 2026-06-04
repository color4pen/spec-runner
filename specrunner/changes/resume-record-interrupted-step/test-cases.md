# Test Cases: resume-record-interrupted-step

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 5
- **Manual**: 2
- **Priority**: must: 5, should: 1, could: 1

---

### TC-001: interruption during a later step records that step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Signal interruption records the in-progress step as the resume point > Scenario: interruption during a later step records that step

---

### TC-002: resume continues from the interrupted step, not the launch step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Signal interruption records the in-progress step as the resume point > Scenario: resume continues from the interrupted step, not the launch step

---

### TC-003: missing in-progress step falls back to the launch step

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Signal interruption records the in-progress step as the resume point > Scenario: missing in-progress step falls back to the launch step

---

### TC-004: `??` semantics — empty string does not trigger fallback to launch step

**Category**: unit
**Priority**: could
**Source**: design.md > Decisions > D1

**GIVEN** the loaded `state.step` is an empty string `""`
**WHEN** the signal-cleanup handler computes `(current.step ?? startStep)`
**THEN** the empty string is not treated as falsy; `resumePoint.step` receives `""` rather than `startStep`

> Note: practically unreachable because `validateJobState` enforces `step` is a non-empty string. Verified by typecheck and inspection rather than a dedicated runtime test.

---

### TC-005: `resolveResumeStep` with `code-review` origin and `iterationsExhausted: 0` returns `code-review`

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** a `resumePoint` with `step: "code-review"` and `iterationsExhausted: 0`
**WHEN** `resolveResumeStep` is called with this resume point
**THEN** the resolved start step is `code-review` (Tier 2c crash-restart), not the launch step `design`
**AND** `resolveResumeStep` and `ResumePoint` are unchanged from pre-fix

---

### TC-006: TypeScript typecheck passes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** the one-line change (`startStep` → `current.step ?? startStep`) is applied in `src/core/runtime/local.ts`
**WHEN** `bun run typecheck` is executed
**THEN** exit code is 0 with no type errors

---

### TC-007: Full test suite passes with no regression

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** T-01 and T-02 changes are applied
**WHEN** `bun run test` is executed
**THEN** all tests exit 0; existing resume-related tests, lifecycle tests, and runtime tests remain green

## Result

```yaml
result: completed
total: 7
automated: 5
manual: 2
must: 5
should: 1
could: 1
blocked_reasons: []
```
