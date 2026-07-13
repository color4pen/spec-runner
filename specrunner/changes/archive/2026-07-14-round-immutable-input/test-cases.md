# Test Cases: 並列 round の入力を immutable にする（共有 deps 不変・resume 配布）

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 13
- **Manual**: 2
- **Priority**: must: 13, should: 2, could: 0

---

### TC-001: shared deps unchanged after a parallel round

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Member execution shall not mutate the shared orchestration input > Scenario: shared deps unchanged after a parallel round

---

### TC-002: consumption order does not decide distribution

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Member execution shall not mutate the shared orchestration input > Scenario: consumption order does not decide distribution

---

### TC-003: human note distributed to all pending members

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Human resume note shall reach every pending member of the round > Scenario: human note distributed to all pending members

---

### TC-004: human note reaches non-target members without automatic context

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Human resume note shall reach every pending member of the round > Scenario: human note reaches non-target members without automatic context

---

### TC-005: automatic context only for the target member

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Automatic resume context shall expand only for the target member > Scenario: automatic context only for the target member

---

### TC-006: member resumePoint mapped to coordinator keeps context

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: member→coordinator resume shall preserve the automatic resume context > Scenario: member resumePoint mapped to coordinator keeps context

---

### TC-007: static step resume context unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: member→coordinator resume shall preserve the automatic resume context > Scenario: static step resume context unchanged

---

### TC-008: --from redirect to a different position drops context

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: member→coordinator resume shall preserve the automatic resume context > Scenario: --from redirect to a different position drops context

---

### TC-009: human note reaches only the resumed step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sequential resume distribution shall be unchanged > Scenario: human note reaches only the resumed step

---

### TC-010: automatic context reaches only the resumed step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sequential resume distribution shall be unchanged > Scenario: automatic context reaches only the resumed step

---

### TC-011: non-resume run receives no resume input

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sequential resume distribution shall be unchanged > Scenario: non-resume run receives no resume input

---

### TC-012: --from explicit with member-origin resumePoint retains context

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs > [Risk] --from 明示時の context 保持が微変化する

**GIVEN** `--from <member>` is supplied and resolves to the coordinator step (`custom-reviewers`)
**AND** `resumePoint.step` is the same member name (member-origin resumePoint present)
**WHEN** `prepare()` builds the resume result
**THEN** `resumeContext` is defined (context is retained, not dropped)
**AND** `resumeContext.resumePoint.step` equals the original member name

---

### TC-013: parallel review fan-out side effects unchanged after roundDeps introduction

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a coordinator round with pending and completed members, as in the existing parallel review setup
**WHEN** the round runs with the new `roundDeps` construction (D2)
**THEN** pending member selection, aggregate verdict computation, review merge, and persist behavior are identical to before the change

---

### TC-014: no in-place assignment to deps.resumePrompt or deps.resumeContext remains in executor.ts

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** the D1 modification is applied to `src/core/step/executor.ts`
**WHEN** reviewing the source of `executor.ts`
**THEN** no line contains an assignment of the form `deps.resumePrompt =` or `deps.resumeContext =`

---

### TC-015: architecture/ directory is not modified by this change

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / request.md > スコープ外

**GIVEN** all implementation tasks (T-01 through T-05) are completed
**WHEN** inspecting the git diff of the branch against main
**THEN** no files under `architecture/` are present in the diff

---

## Result

```yaml
result: completed
total: 15
automated: 13
manual: 2
must: 13
should: 2
could: 0
blocked_reasons: []
```
