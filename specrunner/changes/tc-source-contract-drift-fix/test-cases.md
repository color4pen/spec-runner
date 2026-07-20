# Test Cases: TC Source Contract Drift Fix

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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 7, should: 2, could: 0

---

### TC-001: 正準形式定数が正しい形式文字列を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TC Source 正準形式定数が単一の leaf module に存在する > Scenario: 正準形式定数が正しい形式文字列を保持する

---

### TC-002: test-case-gen の Source フィールド説明が正準形式を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 3 つの step prompt が正準形式定数を参照する > Scenario: test-case-gen の Source フィールド説明が正準形式を含む

---

### TC-003: test-materialize の Scenario 由来 TC 判別条件が正準形式を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 3 つの step prompt が正準形式定数を参照する > Scenario: test-materialize の Scenario 由来 TC 判別条件が正準形式を含む

---

### TC-004: implementer の Scenario 由来 TC 判別条件が正準形式を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 3 つの step prompt が正準形式定数を参照する > Scenario: implementer の Scenario 由来 TC 判別条件が正準形式を含む

---

### TC-005: test-materialize の Scenario 判別条件に旧形式が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: consumer prompt が旧形式 `specs/<capability>/spec.md` を参照しない > Scenario: test-materialize の Scenario 判別条件に旧形式が存在しない

---

### TC-006: implementer の Scenario 判別条件に旧形式が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: consumer prompt が旧形式 `specs/<capability>/spec.md` を参照しない > Scenario: implementer の Scenario 判別条件に旧形式が存在しない

---

### TC-007: tc-source-contract.ts が project-internal import を持たない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/prompts/tc-source-contract.ts` が存在する
**WHEN** ファイルの import 文を検査する
**THEN** `import ... from "../` および `import ... from "../../` を含む行が 0 件である

---

### TC-008: typecheck が全ファイルでエラー 0 件

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** T-01〜T-05 の変更が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript コンパイルエラーが 0 件で終了する

---

### TC-009: 既存テストが無改変で green

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** T-01〜T-05 の変更が完了している（既存テストファイルは無改変）
**WHEN** `bun run test` を実行する
**THEN** `fragment-coverage.test.ts` を含む既存テストがすべて green であり、失敗が 0 件

---

## Result

```yaml
result: completed
total: 9
automated: 9
manual: 0
must: 7
should: 2
could: 0
blocked_reasons: []
```
