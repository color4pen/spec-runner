# Test Cases: regression-gate finding provenance carry

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 18, should: 3, could: 0

---

### TC-001: Ledger block shows a provenance ref per entry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The regression-gate ledger SHALL carry a machine-assigned provenance ref for every entry > Scenario: Ledger block shows a provenance ref per entry

---

### TC-002: The same originating fingerprint yields the same ref

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The regression-gate ledger SHALL carry a machine-assigned provenance ref for every entry > Scenario: The same originating fingerprint yields the same ref

---

### TC-003: A re-reported regression carries its ledger ref

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The regression-gate SHALL echo the provenance ref on each re-reported finding > Scenario: A re-reported regression carries its ledger ref

---

### TC-004: Non-gate steps are unaffected by the additive field

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The regression-gate SHALL echo the provenance ref on each re-reported finding > Scenario: Non-gate steps are unaffected by the additive field

---

### TC-005: Paraphrased-title regression resolves successfully via provenance ref

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--wontfix` SHALL resolve a gate finding to its origin via provenance ref, not regenerated prose > Scenario: Paraphrased-title regression resolves successfully

---

### TC-006: spec-review-origin finding is disposed against its origin step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--wontfix` provenance resolution SHALL cover every ledger-contributing step, including spec-review > Scenario: spec-review-origin finding is disposed against its origin step

---

### TC-007: Missing or unknown ref rejects the whole wontfix operation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Unresolvable provenance SHALL fail all-or-nothing with exit code 2 > Scenario: Missing or unknown ref rejects the whole operation

---

### TC-008: Disposed finding is excluded from the regression-gate ledger

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The persisted decisions format SHALL remain backward compatible > Scenario: Disposed finding is excluded from the regression-gate ledger

---

### TC-009: Disposed finding does not trigger the approved+fixable fixer route

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The persisted decisions format SHALL remain backward compatible > Scenario: Disposed finding does not trigger the approved+fixable fixer route

---

### TC-010: `computeLedgerRef` is deterministic for equal fingerprints

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** two calls to `computeLedgerRef` with findings that share the same file, line, and title (identical fingerprint)
**WHEN** both calls complete
**THEN** both return the same non-empty string value

---

### TC-011: `parseFindings` round-trips a finding that includes a provenance ref

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a raw finding object that includes a `ledgerRef` field containing a valid string value
**WHEN** `parseFindings` processes the object
**THEN** the resulting `Finding` retains the same `ledgerRef` value unchanged

---

### TC-012: `parseFindings` treats an absent or non-string ref as a no-op without raising an error

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a raw finding object with either (a) no `ledgerRef` field or (b) a non-string `ledgerRef` value (e.g. a number or null)
**WHEN** `parseFindings` processes the object
**THEN** the resulting `Finding` has no `ledgerRef` and no missing-field error is raised for the ref field; all other fields parse identically to pre-change behavior

---

### TC-013: `JUDGE_REPORT_TOOL` singleton identity is preserved after schema addition

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** the `JUDGE_REPORT_TOOL` object after the optional `ledgerRef` field is added to `findingSchema` in `src/core/step/report-tool.ts`
**WHEN** `JUDGE_REPORT_TOOL` is imported by `step-completion.ts` and `isJudgeStep` is evaluated for a step whose `reportTool` is `JUDGE_REPORT_TOOL`
**THEN** `isJudgeStep` returns `true` — the singleton reference is unchanged and the identity check continues to work

---

### TC-014: All-origins provenance index covers spec-review StepRuns

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** a job state where a fixable finding exists only in the spec-review StepRun and is absent from every impl reviewer chain StepRun
**WHEN** the all-origins provenance index is built (over spec-review + impl reviewer chain sources)
**THEN** the index contains an entry whose key is that finding's computed `computeLedgerRef`, resolving to a `(stepName, finding)` pair where `stepName` is the spec-review step name

---

### TC-015: All-origins provenance index yields one entry per source step for a shared fingerprint

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md D4

**GIVEN** a code-review StepRun and a spec-review StepRun that both report fixable findings with the same fingerprint (same file, line, title)
**WHEN** the all-origins provenance index is built
**THEN** the shared ref maps to a collection containing two `(stepName, finding)` entries — one for the code-review step and one for the spec-review step — each storing that step's own finding object

---

### TC-016: `computeRegressionLedger` output and existing ledger tests are unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** the regression ledger computation called with the same state inputs as before this change
**WHEN** `computeRegressionLedger` (or equivalent ledger builder) is called
**THEN** the returned findings and dedup ordering are identical to pre-change output; all existing `findings-ledger` test assertions pass without modification

---

### TC-017: Empty-ledger path emits the existing notice with no provenance ref annotations

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** a regression-gate step whose merged ledger contains no fixable findings
**WHEN** `buildMessage` is called
**THEN** the message output contains the pre-existing "empty ledger" notice and does NOT include any provenance ref annotations or ref-related block

---

### TC-018: All existing invalid-input wontfix branches continue to produce exit-2 errors

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `resolveWontfixDispositions` receives one of the following inputs: an out-of-range index, a non-integer index, a duplicate index value, an empty element in the index list, a missing reason, or a state in which the regression-gate has not run
**WHEN** `resolveWontfixDispositions` is called
**THEN** each input returns `{ ok: false }` with the same error message and behavior as before this change; zero disposition records are written

---

### TC-019: `DispositionDecisionRecord` produced via ref-based resolution has unchanged shape

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md D5

**GIVEN** a gate finding that carries a valid provenance ref matching a source-step finding
**WHEN** `resolveWontfixDispositions` produces the `DispositionDecisionRecord` for it
**THEN** the record's fields are exactly `kind`, `id`, `step`, `findingKey`, `finding` (snapshot), `disposition`, `reason`, `decidedAt`, and `source` — no new required fields are present

---

### TC-020: Disposed finding via ref-based path is excluded from fixer input

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** a `DispositionDecisionRecord` produced via the ref-based resolution path, identifying a source-step finding by `step` + `findingKey`
**WHEN** `collectParallelFixerFindings` is called against that state
**THEN** the disposed finding is absent from the returned fixer input list

---

### TC-021: Provenance ref is stable under ledger membership changes

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** a finding whose provenance ref is computed before and after an unrelated finding in the same ledger is disposed (causing the ledger to shrink and reorder)
**WHEN** `computeLedgerRef` is called for that finding in both states
**THEN** the resulting ref string is identical in both calls — the ref is independent of ledger membership and positional ordering

---

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 18
should: 3
could: 0
blocked_reasons: []
```
