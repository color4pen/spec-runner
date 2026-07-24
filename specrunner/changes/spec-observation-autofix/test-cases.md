# Test Cases: spec フェーズの observation auto-fix

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```
-->

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 29
- **Manual**: 1
- **Priority**: must: 18, should: 11, could: 1

---

## Verdict Derivation — `deriveSpecReviewVerdict`

### TC-001: medium fixable on spec.md approves

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain > Scenario: medium fixable finding on spec.md approves

### TC-002: low fixable on design.md approves

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain > Scenario: low fixable finding on design.md approves

### TC-003: high fixable on spec.md remains needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain > Scenario: high fixable finding on spec.md remains needs-fix

### TC-004: critical fixable on spec.md remains needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain > Scenario: critical fixable finding on spec.md remains needs-fix

### TC-005: unroutable request.md fixable finding still escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain > Scenario: unroutable request.md fixable finding still escalates

### TC-016: medium fixable on tasks.md approves

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` and a single finding `severity: "medium"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/tasks.md`
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `approved`

### TC-017: non-canon medium fixable on implementation file approves

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` and a single finding `severity: "medium"`, `resolution: "fixable"`, `file` = `src/example.ts` (a non-canon implementation file)
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `approved` (non-canon files are not subject to canon escalation; unchanged behavior)

### TC-018: non-canon critical or high fixable remains needs-fix

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` and a single finding `severity: "critical"` (or `"high"`), `resolution: "fixable"`, `file` = `src/example.ts` (a non-canon implementation file)
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `needs-fix` (judgment 5: non-canon critical/high → needs-fix; unchanged behavior)

### TC-019: decision-needed finding escalates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` and a finding containing `decisionNeeded: true`
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `escalation` (judgment 3: decision-needed → escalation; unchanged behavior)

### TC-020: ok:false escalates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: false`
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `escalation` (judgment 1: ok:false → escalation; unchanged behavior)

### TC-021: vacuous check (evidence.checked = 0) escalates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` and `evidence.checked === 0`
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `escalation` (judgment 2: vacuous → escalation; unchanged behavior)

### TC-022: unroutable and routable findings coexist — unroutable escalation wins (4a priority)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a spec-review result with `ok: true` carrying two findings: (a) `severity: "medium"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/request.md` (unroutable), and (b) `severity: "medium"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md` (routable)
**WHEN** the spec-review verdict is derived via `deriveSpecReviewVerdict`
**THEN** the verdict is `escalation` (judgment 4a fires before the routable low/medium auto-fix path; 4a priority is unchanged)

---

## State Utility — `buildCanonWriteScopeFromState`

### TC-023: buildCanonWriteScopeFromState returns same scope as buildCanonWriteScope

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a `JobState` from which `getJobSlug(state)` returns a known slug
**WHEN** `buildCanonWriteScopeFromState(state)` and `buildCanonWriteScope(state, { slug: getJobSlug(state) })` are each called
**THEN** both return an identical `CanonWriteScope` — the same `canonPaths` set and the same `writableByFixer` mapping (code-fixer=∅, implementer={tasks.md}, spec-fixer={spec.md, design.md, tasks.md})

---

## Transition Predicates — `spec-observation.ts`

### TC-024: specReviewHasRoutableFixables is false when only non-canon fixable finding present

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a job state where the latest spec-review run has a single finding: `severity: "medium"`, `resolution: "fixable"`, `file` = `src/example.ts` (non-canon, not writable by spec-fixer)
**WHEN** `specReviewHasRoutableFixables(state)` is called
**THEN** the result is `false`

### TC-025: specReviewHasRoutableFixables is false when no spec-review runs exist

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a job state with no completed spec-review step runs (empty or absent spec-review entry in `state.steps`)
**WHEN** `specReviewHasRoutableFixables(state)` is called
**THEN** the result is `false`

### TC-026: specFixerForwardsToTestGen is false when no spec-review runs exist

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a job state with no completed spec-review step runs
**WHEN** `specFixerForwardsToTestGen(state)` is called
**THEN** the result is `false`

---

## Transition Table — `STANDARD_TRANSITIONS`

### TC-006: approved with routable fixable routes to spec-fixer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review approval with routable fixable findings shall route to spec-fixer > Scenario: approved with routable fixable routes to spec-fixer

### TC-007: approved with no routable fixable routes to test-case-gen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review approval with routable fixable findings shall route to spec-fixer > Scenario: approved with no routable fixable routes to test-case-gen

### TC-008: observation-pass spec-fixer forwards to test-case-gen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer following a spec-review approval shall forward to test-case-gen without re-review > Scenario: observation-pass spec-fixer forwards to test-case-gen

### TC-009: needs-fix spec-fixer returns to spec-review

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix and conformance-triggered spec-fixer shall return to spec-review > Scenario: needs-fix spec-fixer returns to spec-review

### TC-010: conformance-triggered spec-fixer returns to spec-review

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-fix and conformance-triggered spec-fixer shall return to spec-review > Scenario: conformance-triggered spec-fixer returns to spec-review

### TC-027: high fixable verdict path — full needs-fix loop (spec-review → spec-fixer → spec-review)

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 (遷移テスト — needs-fix 往復不変)

**GIVEN** a spec-review result with `ok: true` and `severity: "high"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md`; followed by a spec-fixer run completing with verdict `"approved"`; the latest spec-review run verdict remains `"needs-fix"`
**WHEN** the standard transition table resolves (1) spec-review on `"needs-fix"`, then (2) spec-fixer on `"approved"` in that state
**THEN** (1) spec-review on `"needs-fix"` → `spec-fixer`; (2) spec-fixer on `"approved"` (with latest spec-review verdict=`"needs-fix"`) → `spec-review` (not `test-case-gen`); also verified for `severity: "critical"` fixable

### TC-029: STANDARD_TRANSITIONS length is 46 after adding two guarded rows

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 (TC-030 in pipeline.transitions.test.ts); design.md > D4

**GIVEN** the `STANDARD_TRANSITIONS` array with the two new guarded rows added (one before `SPEC_REVIEW approved → TEST_CASE_GEN`, one before `SPEC_FIXER approved → SPEC_REVIEW`)
**WHEN** `STANDARD_TRANSITIONS.length` is inspected
**THEN** the length is `46` (previously `44` prior to this change; +2 for the two guarded rows)

---

## Findings Ledger — `collectSpecReviewLedger` / `regression-gate`

### TC-011: consumed spec-review fixable finding appears in the regression-gate ledger

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review fixable findings shall be verified by the regression-gate ledger > Scenario: consumed spec-review fixable finding appears in the regression-gate ledger

### TC-012: regression-gate is not skipped for spec-review-only ledger

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review fixable findings shall be verified by the regression-gate ledger > Scenario: regression-gate not skipped for spec-review-only ledger

### TC-028: request.md spec-review fixable finding is excluded from ledger with canonScope

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a job state with a spec-review run carrying a `resolution: "fixable"` finding on `specrunner/changes/<slug>/request.md`; a `canonScope` built with `specReviewEffectiveFixer` (spec-fixer writable paths: `spec.md`, `design.md`, `tasks.md`)
**WHEN** `collectSpecReviewLedger(state, canonScope)` is called
**THEN** the returned ledger does NOT contain the `request.md` finding (it is excluded as unroutable to spec-fixer); findings on `spec.md` / `design.md` / `tasks.md` are retained

---

## Budget — Loop Iteration Count

### TC-013: observation pass runs spec-review exactly once

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the observation pass shall not consume the spec-review loop budget > Scenario: observation pass runs spec-review once

---

## Invariants — Unchanged Behavior

### TC-014: code-review verdict derivation is unchanged

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: impl-side observation auto-fix and other verdict derivations shall be unchanged > Scenario: code-review verdict derivation unchanged

### TC-015: FAST transitions contain no spec-review / spec-fixer / test-case-gen rows

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: impl-side observation auto-fix and other verdict derivations shall be unchanged > Scenario: FAST transitions unchanged

---

## Review Note — Existing Test Behavior Change

### TC-030: TC-CONFRT-07 conformance routing test — same-timestamp edge case behavior change

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-07 (pipeline.conformance-routing.test.ts TC-CONFRT-07)

**GIVEN** the existing `pipeline.conformance-routing.test.ts` TC-CONFRT-07, which uses an identical timestamp (`'2026-01-01T00:00:00.000Z'`) for all steps including the conformance and spec-fixer runs; after the guarded `SPEC_FIXER approved → TEST_CASE_GEN` row is added, `getConformanceFixContext(state, SPEC_FIXER)` returns `null` for equal timestamps (the `>=` recency check treats equal as "not newer"), causing `specFixerForwardsToTestGen` to return `true` and the spec-fixer to forward to `test-case-gen` instead of `spec-review`
**WHEN** TC-CONFRT-07 is run after the guarded row is added
**THEN** the test still passes (the final `specFixerCallCount === 3` and `awaiting-archive` assertions hold), but the conformance → spec-fixer → spec-review reverification loop is no longer exercised for this test; the reverification invariant is instead covered by TC-010 (which uses proper distinct timestamps); this behavior change MUST be documented in `implementation-notes.md`

---

## Result

```yaml
result: completed
total: 30
automated: 29
manual: 1
must: 18
should: 11
could: 1
blocked_reasons: []
```
