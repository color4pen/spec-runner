# Test Cases: severity と fixability の分離 — LOW も fixable なら直す

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

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 12, should: 3, could: 0

---

## Routing Layer

### TC-001: LOW fixable finding is included in the fixer target set

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity > Scenario: LOW fixable finding is included in the fixer target set

---

### TC-002: only-LOW input still routes the LOW findings

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity > Scenario: only-LOW input still routes the LOW findings

---

### TC-003: non-fixable findings are still excluded from fixer target set

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity > Scenario: non-fixable findings are still excluded

---

## Code-Fixer Prompt Content

### TC-004: LOW fixable finding appears in the code-fixer prompt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Code-fixer instructions treat every routed finding as a mandatory fix regardless of severity > Scenario: LOW fixable finding appears in the code-fixer prompt

---

### TC-005: message states findings are fixed regardless of severity

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Code-fixer instructions treat every routed finding as a mandatory fix regardless of severity > Scenario: message states findings are fixed regardless of severity

---

### TC-006: code-fixer system prompt does not instruct ignoring LOW findings

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer prompts contain no severity-based re-filter > Scenario: code-fixer system prompt does not instruct ignoring LOW findings

---

## Verdict Semantics (preserved)

### TC-007: high fixable finding yields needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Critical/high fixable findings retain the fix-plus-re-review path > Scenario: high fixable finding yields needs-fix

---

### TC-008: low/medium fixable yields approved verdict

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Low/medium fixable findings are fixed without re-review > Scenario: low/medium fixable yields approved verdict

---

### TC-009: code-fixer that applied an approved-path fix proceeds without re-review

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Low/medium fixable findings are fixed without re-review > Scenario: code-fixer that applied an approved-path fix proceeds without re-review

---

## Regression-Gate

### TC-010: a low-severity ledger entry that regressed yields needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Regression-gate verifies the entire findings ledger > Scenario: a low-severity ledger entry that regressed yields needs-fix

---

## No-Op Detection

### TC-011: approved findings-routing no-op is escalated

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A code-fixer no-op on a routed target is not silently accepted > Scenario: approved findings-routing no-op is escalated

---

### TC-012: a finding-named document change still counts as work

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A code-fixer no-op on a routed target is not silently accepted > Scenario: a finding-named document change still counts as work

---

## Design-Derived (Non-Scenario)

### TC-013: critical fixable finding also yields needs-fix

**Category**: unit
**Priority**: should
**Source**: design.md > D6 (verdict / 再レビュー要否の意味論は不変)

**GIVEN** a findings array containing a `critical` + `fixable` finding and ok=true, with no decision-needed findings
**WHEN** `deriveJudgeVerdict` is called
**THEN** the verdict is `needs-fix`

---

### TC-014: spec-fixer system prompt contains no severity-based re-filter

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (Acceptance Criteria: spec-fixer system prompt は無変更)

**GIVEN** the assembled `SPEC_FIXER_SYSTEM_PROMPT` content
**WHEN** its text is inspected for severity-filtering language
**THEN** it contains no instruction to ignore, skip, or condition findings based on `low` severity (the prompt is unchanged and remains severity-neutral)

---

### TC-015: code-fixer step message write-scope guards are preserved across all branches

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (Acceptance Criteria: write-scope ガード行は保持する)

**GIVEN** any non-continuation code-fixer message branch (conformance, coordinator-aggregated, coordinator-fallback, standard-embedded, standard-fallback) with at least one routed finding
**WHEN** `buildMessage` produces the prompt
**THEN** the prompt contains write-scope guard text prohibiting new features or specification changes (e.g. "Do NOT add new features"), in addition to the severity-neutral fix instruction

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 12
should: 3
could: 0
blocked_reasons: []
```
