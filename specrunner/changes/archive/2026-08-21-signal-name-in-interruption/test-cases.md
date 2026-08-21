# Test Cases: Signal Name in Interruption Records

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 21, should: 2, could: 0

---

## Interruption Record — Signal Name Field

### TC-001: SIGTERM received — interruption record includes signal name (local runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Interruption records SHALL carry the signal name > Scenario: SIGTERM received — interruption record includes signal name

### TC-002: SIGINT received — interruption record includes signal name (local runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Interruption records SHALL carry the signal name > Scenario: SIGINT received — interruption record includes signal name

### TC-003: SIGHUP received — interruption record includes signal name (local runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Interruption records SHALL carry the signal name > Scenario: SIGHUP received — interruption record includes signal name

### TC-004: exit-guard fires (no signal handler ran) — signal field absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Interruption records SHALL carry the signal name > Scenario: exit-guard fires (no signal handler ran) — signal field absent

---

## Transition History Message

### TC-005: SIGTERM — transition message includes signal name (local runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transition history message SHALL include the signal name > Scenario: SIGTERM — transition message includes signal name (local runtime)

### TC-006: SIGTERM — transition message includes signal name (managed runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transition history message SHALL include the signal name > Scenario: SIGTERM — transition message includes signal name (managed runtime)

### TC-007: SIGHUP — transition message includes signal name (local runtime)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transition history message SHALL include the signal name > Scenario: SIGHUP — transition message includes signal name (local runtime)

### TC-008: SIGINT — transition message includes signal name (managed runtime)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: Write pinning tests for managed runtime signal recording

**GIVEN** a job is running under the managed runtime with an active `signalCleanup` handler
**WHEN** the process receives SIGINT and `signalCleanup` runs
**THEN** the state passed to `store.persist` has a history entry whose `reason` field is `"Interrupted by SIGINT"`

### TC-009: SIGHUP — transition message includes signal name (managed runtime)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: Write pinning tests for managed runtime signal recording

**GIVEN** a job is running under the managed runtime with an active `signalCleanup` handler
**WHEN** the process receives SIGHUP and `signalCleanup` runs
**THEN** the state passed to `store.persist` has a history entry whose `reason` field is `"Interrupted by SIGHUP"`

---

## Backward Compatibility — resumePoint.reason Unchanged

### TC-010: SIGTERM — resumePoint.reason is unchanged in local runtime

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePoint.reason SHALL remain unchanged > Scenario: SIGTERM — resumePoint.reason is unchanged in local runtime

### TC-011: SIGTERM — resumePoint.reason is unchanged in managed runtime

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePoint.reason SHALL remain unchanged > Scenario: SIGTERM — resumePoint.reason is unchanged in managed runtime

### TC-012: exit-guard — resumePoint.reason is "signal"

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePoint.reason SHALL remain unchanged > Scenario: exit-guard — resumePoint.reason is "signal"

---

## SIGHUP Handler Registration and Deregistration

### TC-013: SIGHUP registered in local runtime

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SIGHUP SHALL be registered and deregistered in both runtimes > Scenario: SIGHUP registered in local runtime

### TC-014: SIGHUP deregistered in local runtime teardown

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SIGHUP SHALL be registered and deregistered in both runtimes > Scenario: SIGHUP deregistered in local runtime teardown

### TC-015: SIGHUP registered in managed runtime

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SIGHUP SHALL be registered and deregistered in both runtimes > Scenario: SIGHUP registered in managed runtime

### TC-016: SIGHUP deregistered in managed runtime teardown

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SIGHUP SHALL be registered and deregistered in both runtimes > Scenario: SIGHUP deregistered in managed runtime teardown

---

## Type Safety

### TC-017: InterruptionRecord TypeScript type accepts optional signal field

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add `signal` field to `InterruptionRecord` type

**GIVEN** the `InterruptionRecord` type in `src/store/event-journal.ts` is extended with `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"`
**WHEN** TypeScript compiles an object literal `{ type: "interruption", reason: "signal", signal: "SIGTERM", ts: "..." }` against the type
**THEN** no type error is raised

### TC-018: InterruptionRecord TypeScript type remains valid without signal field

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add `signal` field to `InterruptionRecord` type

**GIVEN** the `InterruptionRecord` type has `signal` as an optional field
**WHEN** TypeScript compiles an object literal `{ type: "interruption", reason: "signal", ts: "..." }` (no `signal` field) against the type — as occurs in `exit-guard.ts` call-sites
**THEN** no type error is raised; existing `appendInterruption` call-sites in `exit-guard.ts` compile without modification

---

## Regression — Existing Tests Pass Unchanged

### TC-019: signal-handler-order.test.ts passes without modification

**Category**: unit
**Priority**: must
**Source**: design.md > Risks / Trade-offs: Existing test `signal-handler-order.test.ts` calls `signalCleanup()` without arguments

**GIVEN** `signal-handler-order.test.ts` calls `signalCleanup()` (no argument) via a `as unknown as` cast, with `appendInterruption` and `persist` mocked
**WHEN** `signalCleanup` now accepts `signal: NodeJS.Signals` as its first parameter
**THEN** the call succeeds at runtime — `signal` is `undefined`, JSON serialization omits it, and all existing assertions in the test continue to pass without any modification to the test file

### TC-020: exit-guard.test.ts passes without modification

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D5: exit-guard call-sites unchanged

**GIVEN** `exit-guard.test.ts` asserts `resumePoint.reason: "signal"` on exit-guard-generated records
**WHEN** the source changes are applied (no modification to exit-guard call-sites)
**THEN** all assertions in `exit-guard.test.ts` pass without any modification to the test file

### TC-021: Resume and canon-provenance tests pass without modification

**Category**: unit
**Priority**: must
**Source**: design.md > Risks / Trade-offs: Transition history message change breaks existing tests

**GIVEN** `member-resume-routing.test.ts` and `resume-member-context.test.ts` use `resumePoint.reason: "Interrupted by signal"` in fixture objects, and `apply-canon-provenance.test.ts` relies on `INTERRUPTION_REASONS` matching `"signal"`
**WHEN** the source changes are applied (`resumePoint.reason` and `INTERRUPTION_REASONS` are left unchanged)
**THEN** all assertions in these test files pass without any modification

---

## Gate

### TC-022: TypeScript typecheck passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: Verify full test suite passes

Verification: `bun run typecheck` exits with code 0 and reports zero type errors.

### TC-023: Full test suite passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: Verify full test suite passes

Verification: `bun run test` exits with code 0 with all tests green, including the new signal-name pinning tests (T-04, T-05) and all pre-existing tests.

---

## Result

```yaml
result: completed
total: 23
automated: 21
manual: 0
must: 21
should: 2
could: 0
blocked_reasons: []
```
