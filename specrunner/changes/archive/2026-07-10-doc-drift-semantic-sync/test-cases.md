# Test Cases: doc-drift-semantic-sync

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 8
- **Manual**: 5
- **Priority**: must: 10, should: 3, could: 0

---

### TC-001: README custom-reviewer description reflects parallel execution

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: authority documents match the implementation > Scenario: README custom-reviewer description reflects parallel execution

---

### TC-002: Registry comments state the real step counts

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: authority documents match the implementation > Scenario: registry comments state the real step counts

---

### TC-003: Domain-model version description matches the schema union

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: authority documents match the implementation > Scenario: domain-model version description matches the schema union

---

### TC-004: Correct N-step counts pass the step-count guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry step-count comments are drift-guarded against descriptor step counts > Scenario: correct counts pass

---

### TC-005: A wrong N-step number fails the step-count guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry step-count comments are drift-guarded against descriptor step counts > Scenario: a wrong "N-step" number fails the guard

---

### TC-006: A missing N-step annotation fails the step-count guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry step-count comments are drift-guarded against descriptor step counts > Scenario: a missing annotation does not silently pass

---

### TC-007: Current version description passes the version guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: domain-model version description is drift-guarded against the schema version union > Scenario: current description passes

---

### TC-008: Reverting domain-model version to "常に 1" fails the version guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: domain-model version description is drift-guarded against the schema version union > Scenario: reverting to "常に 1" fails the guard

---

### TC-009: Existing README drift guard stays green after T-01 rewording

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** README.md has been reworded to describe the parallel fan-out (T-01), and `readme-pipeline-sync.test.ts` asserts every `STEP_NAMES` value appears in README  
**WHEN** the existing `readme-pipeline-sync.test.ts` suite runs  
**THEN** it passes without any modification — the `code-review` token is still present in the reworded sentence

---

### TC-010: No non-comment lines in registry.ts are changed

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** the diff for `src/core/pipeline/registry.ts` from the change branch  
**WHEN** each changed line is inspected  
**THEN** every changed line is a comment line (JS `//` or `/* */`) — no `steps` array entries, transitions, roles, or executable code are touched

---

### TC-011: Step-count guard derives expected values from descriptor.steps.length, not literals

**Category**: manual
**Priority**: should
**Source**: design.md > D3 — Expected values are derived from the implementation, not hardcoded / tasks.md > T-04

**GIVEN** `tests/unit/docs/doc-drift-sync.test.ts` is reviewed  
**WHEN** the axis-(a) assertions are read  
**THEN** the expected step count in each assertion is `descriptor.steps.length` (where descriptor is an imported constant), and no numeric literal `13`, `1`, or `9` appears as the expected value in the comparison

---

### TC-012: Version guard derives allowed version set from schema.ts source, not literals

**Category**: manual
**Priority**: should
**Source**: design.md > D3 — Expected values are derived from the implementation, not hardcoded / tasks.md > T-05

**GIVEN** `tests/unit/docs/doc-drift-sync.test.ts` is reviewed  
**WHEN** the axis-(b) assertions are read  
**THEN** the set of allowed version numbers is constructed by regex-parsing `schema.ts` source (not by a hardcoded array `[1, 2]` or literal `2` in the test)

---

### TC-013: typecheck && test gate is green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** all changes from T-01 through T-05 are applied and `doc-drift-sync.test.ts` is in place  
**WHEN** `bun run typecheck && bun run test` is executed  
**THEN** both commands exit with code 0 — no existing test file was modified to achieve this, and the new test file is the only addition to `tests/`

---

## Result

```yaml
result: completed
total: 13
automated: 8
manual: 5
must: 10
should: 3
could: 0
blocked_reasons: []
```
