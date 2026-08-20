# Test Cases: checkpoint 検証の分離 — generic integrity と use-case policy の二層化

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
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration: 11, gate: 3): 14
- **Manual**: 0
- **Priority**: must: 14, should: 0, could: 0

---

## Policy Injection

### TC-001: existing callers work without supplying a policy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verifyCheckpoint shall accept an optional verification policy > Scenario: existing callers work without supplying a policy

### TC-002: a custom policy can be injected at call site

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verifyCheckpoint shall accept an optional verification policy > Scenario: a custom policy can be injected at call site

---

## Generic Integrity Independence

### TC-003: generic checks fire even when a permissive policy is supplied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: generic integrity verification shall be independent of use-case policy > Scenario: generic checks fire even when a permissive policy is supplied

### TC-004: integrity failure rejects before policy is evaluated

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: generic integrity verification shall be independent of use-case policy > Scenario: integrity failure rejects before policy is evaluated

---

## attachResumePolicy Unit

### TC-005: status not awaiting-resume is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: status not awaiting-resume is rejected by attachResumePolicy

### TC-006: resume point unresolvable is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: resume point unresolvable is rejected by attachResumePolicy

### TC-007: required reads() input missing is rejected by attachResumePolicy

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume-specific checks shall live exclusively in attachResumePolicy > Scenario: required reads() input missing is rejected by attachResumePolicy

---

## End-to-End Behavior Preservation

### TC-008: awaiting-archive checkpoint is rejected end-to-end

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach-resume behavior shall be preserved end-to-end > Scenario: awaiting-archive checkpoint is rejected (end-to-end)

### TC-009: valid awaiting-resume checkpoint is accepted end-to-end

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach-resume behavior shall be preserved end-to-end > Scenario: valid awaiting-resume checkpoint is accepted (end-to-end)

---

## Structural Constraints

### TC-010: verify-checkpoint.ts has no direct resume-specific imports

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** the refactored `src/core/attach/verify-checkpoint.ts`
**WHEN** its import statements are inspected
**THEN** `getPipelineDescriptor`, `getPipelineId`, `resolveResumeStep`, and `buildAllowedStepSet` are not directly imported (they have moved to `checkpoint-policy.ts`)

### TC-011: verify-checkpoint.ts contains no awaiting-resume status literal

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** the refactored `src/core/attach/verify-checkpoint.ts`
**WHEN** its source text is inspected
**THEN** the string `"awaiting-resume"` does not appear (the status check has moved to `attachResumePolicy`)

---

## Gate

### TC-012: architecture allowlist is unchanged

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-03

`bun run test tests/unit/architecture/` — `tests/unit/architecture/arch-allowlist.ts` が新エントリなしで green。

### TC-013: typecheck exits 0

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04

`bun run typecheck` — exit code 0。

### TC-014: full test suite exits 0

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04

`bun run test` — 既存テスト無改変 + 新規テスト全 green、exit code 0。

---

## Result

```yaml
result: completed
total: 14
automated: 14
manual: 0
must: 14
should: 0
could: 0
blocked_reasons: []
```
