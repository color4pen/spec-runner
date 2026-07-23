# Test Cases: spec-fixer tasks.md writable

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 14
- **Manual**: 1
- **Priority**: must: 7, should: 5, could: 3

---

### TC-001: writes() exposes tasks.md alongside spec.md and design.md

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL declare tasks.md in its canon write-set > Scenario: writes() exposes tasks.md alongside spec.md and design.md

---

### TC-002: D5 canon-write-scope map grants spec-fixer tasks.md and excludes unroutable files

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-fixer SHALL declare tasks.md in its canon write-set > Scenario: the D5 canon-write-scope map grants spec-fixer tasks.md

---

### TC-003: medium fixable finding on tasks.md yields needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review SHALL route fixable tasks.md findings to spec-fixer regardless of severity > Scenario: medium fixable finding on tasks.md yields needs-fix

---

### TC-004: spec-review needs-fix reaches spec-fixer in the transition table

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review SHALL route fixable tasks.md findings to spec-fixer regardless of severity > Scenario: spec-review needs-fix reaches spec-fixer in the transition table

---

### TC-005: fixable finding on test-cases.md escalates with CANON_FINDING_ESCALATION reason

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review SHALL keep escalating fixable findings on canon files spec-fixer cannot write > Scenario: fixable finding on test-cases.md escalates with reason

---

### TC-006: fixable finding on request.md escalates with CANON_FINDING_ESCALATION reason

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review SHALL keep escalating fixable findings on canon files spec-fixer cannot write > Scenario: fixable finding on request.md escalates with reason

---

### TC-007: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: conformance routing of tasks.md findings SHALL follow the expanded write-set > Scenario: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer

---

### TC-008: conformance tasks.md finding with fixTarget code-fixer still escalates

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: conformance routing of tasks.md findings SHALL follow the expanded write-set > Scenario: conformance tasks.md finding with fixTarget code-fixer still escalates

---

### TC-009: drift-guard confirms spec-fixer writes() equals its D5 map entry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the write-set declaration SHALL remain drift-guarded across its synchronization points > Scenario: drift-guard confirms spec-fixer writes() equals its D5 map entry

---

### TC-010: conformance-entry message names tasks.md as a fixable artifact

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: the spec-fixer prompt SHALL name tasks.md as a fixable target > Scenario: conformance-entry message names tasks.md

---

### TC-011: spec-fixer system prompt write-set names tasks.md

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: the spec-fixer prompt SHALL name tasks.md as a fixable target > Scenario: system prompt write-set names tasks.md

---

### TC-012: conformance tasks.md finding with fixTarget implementer yields needs-fix:implementer

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a conformance result with a finding `{ severity: "medium", resolution: "fixable", file: "specrunner/changes/<slug>/tasks.md", fixTarget: "implementer" }` and a canon write scope where tasks.md is in the spec-fixer writable set
**WHEN** `deriveConformanceVerdict` is evaluated
**THEN** the verdict is `needs-fix:implementer`

---

### TC-013: code-fixer D5 map entry remains empty (∅) after write-set expansion

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 (do NOT change the code-fixer entry)

**GIVEN** `buildCanonWriteScope(state, deps)` is evaluated after tasks.md is added to spec-fixer's write set
**WHEN** the `code-fixer` entry of `writableByFixer` is read
**THEN** it is empty (∅), unchanged from before the write-set expansion

---

### TC-014: implementer D5 map entry remains {tasks.md} after write-set expansion

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 (do NOT change the implementer entry)

**GIVEN** `buildCanonWriteScope(state, deps)` is evaluated after tasks.md is added to spec-fixer's write set
**WHEN** the `implementer` entry of `writableByFixer` is read
**THEN** it contains exactly `tasks.md` and only `tasks.md`, unchanged from before the write-set expansion

---

### TC-015: implementation-notes.md exists and enumerates all updated tests

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** the change is implemented
**WHEN** `specrunner/changes/spec-fixer-tasks-md-writable/implementation-notes.md` is reviewed
**THEN** it exists and lists all four test locations whose expectations changed:
`src/core/step/__tests__/spec-review-fixer-routing.test.ts` (makeCanonScope fixture + TC-013 + new test-cases.md escalationReason sub-test),
`tests/unit/core/step/canon-write-scope.test.ts` (TC-019 + TC-029 title),
`tests/unit/core/step/judge-verdict-canon.test.ts` (makeFullCanonScope fixture + TC-006 second sub-test),
`tests/unit/step/step-io-contracts.test.ts` (spec-fixer writes() strengthened with tasks.md)

---

## Result

```yaml
result: completed
total: 15
automated: 14
manual: 1
must: 7
should: 5
could: 3
blocked_reasons: []
```
