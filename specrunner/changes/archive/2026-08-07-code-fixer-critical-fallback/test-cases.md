# Test Cases: code-fixer CRITICAL fallback fix

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 5
- **Manual**: 0
- **Priority**: must: 8, should: 0, could: 0

---

### TC-001: coordinator-loop fallback prompt includes CRITICAL

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: All code-fixer prompt branches MUST include CRITICAL in mandatory severity > Scenario: coordinator-loop fallback prompt includes CRITICAL

---

### TC-002: standard-path fallback prompt includes CRITICAL

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: All code-fixer prompt branches MUST include CRITICAL in mandatory severity > Scenario: standard-path fallback prompt includes CRITICAL

---

### TC-003: conformance path prompt includes CRITICAL

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (branch 1: Conformance path)

**GIVEN** a state where `getConformanceFixContext` returns non-null — a `conformance` entry in `state.steps` with verdict `needs-fix:code-fixer` and `toolResult.findings` populated
**WHEN** `CodeFixerStep.buildMessage` is called
**THEN** the returned message contains `"Fix all HIGH and CRITICAL severity findings"`

---

### TC-004: coordinator-loop findings-embedded path includes CRITICAL

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (branch 2: Coordinator loop — findings embedded)

**GIVEN** a state where `isCoordinatorLoopActive` is true AND `collectParallelFixerFindings` returns at least one finding (a reviewer step with structured findings in its outcome)
**WHEN** `CodeFixerStep.buildMessage` is called
**THEN** the returned message contains `"Fix all HIGH and CRITICAL severity findings"`

---

### TC-005: standard-path findings-embedded path includes CRITICAL

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (branch 4: Standard path — findings embedded)

**GIVEN** a state where the code-review outcome has a structured `findings` array (inline, not file-path fallback) in its step result
**WHEN** `CodeFixerStep.buildMessage` is called
**THEN** the returned message contains `"Fix all HIGH and CRITICAL severity findings"`

---

### TC-006: no bare "Fix all HIGH severity findings" remains in code-fixer.ts

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01 (acceptance criteria: grep returns 0 matches)

Verification: `grep -n "Fix all HIGH severity findings" src/core/step/code-fixer.ts` exits with no matches (0 lines output).

---

### TC-007: typecheck passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-03

Verification: `bun run typecheck` exits 0.

---

### TC-008: full test suite green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-03

Verification: `bun run test` exits 0; all tests including the new five-branch describe block pass, and no existing tests are broken.

---

## Result

```yaml
result: completed
total: 8
automated: 5
manual: 0
must: 8
should: 0
could: 0
blocked_reasons: []
```
