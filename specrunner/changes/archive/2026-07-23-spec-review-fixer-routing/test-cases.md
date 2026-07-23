# Test Cases: spec-review fixer routing

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

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 16, should: 4, could: 0

---

### TC-001: medium fixable finding on spec.md routes to spec-fixer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall route fixable findings on spec-fixer-writable canon files to spec-fixer regardless of severity > Scenario: medium fixable finding on spec.md routes to spec-fixer

---

### TC-002: low fixable finding on design.md routes to spec-fixer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall route fixable findings on spec-fixer-writable canon files to spec-fixer regardless of severity > Scenario: low fixable finding on design.md routes to spec-fixer

---

### TC-003: fixable finding on request.md escalates with reason

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall escalate fixable findings on canon files spec-fixer cannot write > Scenario: fixable finding on request.md escalates with reason

---

### TC-004: escalation-and-routable coexistence prefers escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall escalate fixable findings on canon files spec-fixer cannot write > Scenario: escalation-and-routable coexistence prefers escalation

---

### TC-005: routable spec.md finding yields no escalation reason

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review verdict derivation and escalationReason computation shall reference the same effective fixer resolver > Scenario: routable spec.md finding yields no escalation reason

---

### TC-006: unroutable request.md finding yields a canon escalation reason under the same resolver

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review verdict derivation and escalationReason computation shall reference the same effective fixer resolver > Scenario: unroutable request.md finding yields a canon escalation reason under the same resolver

---

### TC-007: medium fixable finding on a non-canon file approves

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall preserve existing non-canon verdict behavior > Scenario: medium fixable finding on a non-canon file approves

---

### TC-008: decision-needed finding escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review shall preserve existing non-canon verdict behavior > Scenario: decision-needed finding escalates

---

### TC-009: repeated needs-fix exhausts at the existing limit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the spec-review→spec-fixer loop shall remain bounded by the existing exhaustion limit > Scenario: repeated needs-fix exhausts at the existing limit

---

### TC-010: code-review canon escalation still uses the judge resolver

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: other judge, conformance, regression-gate, and request-review verdict derivation shall be unchanged > Scenario: code-review canon escalation still uses the judge resolver

---

### TC-011: specReviewEffectiveFixer always returns "spec-fixer" regardless of finding content

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** any `Finding` object (with arbitrary severity, file path, and resolution)
**WHEN** `specReviewEffectiveFixer(finding)` is called
**THEN** the return value is `"spec-fixer"` for all inputs

---

### TC-012: selectRoutableCanonFindings returns only findings on spec-fixer-writable canon paths

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a canon scope for a slug containing a mixed list of findings:
- a fixable finding on `specrunner/changes/<slug>/spec.md` (routable)
- a fixable finding on `specrunner/changes/<slug>/design.md` (routable)
- a fixable finding on `specrunner/changes/<slug>/request.md` (unroutable)
- a fixable finding on `src/example.ts` (non-canon)
**WHEN** `selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)` is called
**THEN** only the spec.md and design.md findings are returned; request.md and src/example.ts findings are excluded

---

### TC-013: deriveSpecReviewVerdict — fixable finding on tasks.md escalates

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** a spec-review step result with `ok: true` and a single finding with `resolution: "fixable"` and `file` = `specrunner/changes/<slug>/tasks.md`
**WHEN** `deriveSpecReviewVerdict` is called with the canon scope
**THEN** the verdict is `escalation`

---

### TC-014: deriveSpecReviewVerdict — ok:false always escalates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a spec-review step result with `ok: false` and no findings
**WHEN** `deriveSpecReviewVerdict` is called
**THEN** the verdict is `escalation`

---

### TC-015: deriveSpecReviewVerdict — vacuous evidence (checked=0) escalates

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a spec-review step result with `ok: true` and `evidence.checked = 0`
**WHEN** `deriveSpecReviewVerdict` is called with the evidence object
**THEN** the verdict is `escalation`

---

### TC-016: deriveSpecReviewVerdict — non-canon critical finding yields needs-fix

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** a spec-review step result with `ok: true` and a single finding with `severity: "critical"`, `resolution: "fixable"`, and `file = "src/example.ts"` (non-canon)
**WHEN** `deriveSpecReviewVerdict` is called with a canon scope
**THEN** the verdict is `needs-fix`

---

### TC-017: SpecReviewStep.judgeVerdictFn is identity-equal to deriveSpecReviewVerdict

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03, T-05

**GIVEN** the `SpecReviewStep` configuration object produced by the spec-review step factory
**WHEN** the `judgeVerdictFn` field is accessed
**THEN** it is strictly reference-equal (`===`) to `deriveSpecReviewVerdict`

---

### TC-018: spec-review step with ok:false escalation yields no escalationReason

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a spec-review step result with `ok: false` and no findings (non-canon-source escalation)
**WHEN** `deriveStepCompletion` is called for the spec-review step
**THEN** the resulting step completion has verdict `escalation` and `escalationReason` is not set

---

### TC-019: conformance step escalationReason resolver remains conformanceEffectiveFixer

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a conformance step result with `ok: true` and a fixable finding on a canon file where the finding's `fixTarget` is `"code-fixer"`
**WHEN** `deriveStepCompletion` is called for the conformance step
**THEN** `escalationReason` is computed using `conformanceEffectiveFixer` (the finding's `fixTarget` is respected), matching pre-change behavior

---

### TC-020: typecheck && test pass green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** the implementation changes for T-01 through T-05 are applied to the codebase
**WHEN** the full `typecheck && test` suite is executed
**THEN** all type checks pass and all tests are green, including existing judge / conformance / regression-gate / request-review tests with no assertions modified

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 16
should: 4
could: 0
blocked_reasons: []
```
