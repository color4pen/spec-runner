# Test Cases: test-cases-from-spec-scenarios

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
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
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 9
- **Manual**: 3
- **Priority**: must: 11, should: 1, could: 0

---

### TC-001: delta spec の各 Scenario が test case にマップされる

**Category**: manual
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: test-case-gen は delta spec の Scenario を acceptance test の source として test-cases.md を生成する > Scenario: delta spec に 2 つの Scenario がある change で test-cases.md を生成

**GIVEN** change folder に delta spec が存在し、2 つの Requirement に各 1 つの Scenario がある  
**WHEN** test-case-gen step が test-cases.md を生成する  
**THEN** test-cases.md に少なくとも 2 つの test case が含まれる

---

### TC-002: 生成された acceptance test の Source が Scenario を参照する

**Category**: manual
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: test-case-gen は delta spec の Scenario を acceptance test の source として test-cases.md を生成する > Scenario: delta spec に 2 つの Scenario がある change で test-cases.md を生成

**GIVEN** change folder に delta spec が存在し、test-case-gen が test-cases.md を生成した  
**WHEN** 生成された test-cases.md の各 acceptance test case の Source フィールドを確認する  
**THEN** 各 Source フィールドが対応する delta spec の Scenario を参照している

---

### TC-003: delta spec 不在時に design.md/tasks.md フォールバックが機能する

**Category**: manual
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: test-case-gen は delta spec の Scenario を acceptance test の source として test-cases.md を生成する > Scenario: delta spec が存在しない change

**GIVEN** change folder に `specs/` ディレクトリが存在しない  
**WHEN** test-case-gen step が test-cases.md を生成する  
**THEN** design.md / tasks.md から test case が生成される（後方互換フォールバック）

---

### TC-004: system prompt が Source フィールドの breadcrumb 形式を指示する

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: test-cases.md の Source フィールドは delta spec の Scenario を参照する形式でなければならない > Scenario: Source フィールドが Scenario を参照している

**GIVEN** test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）を確認する  
**WHEN** Test Case Format セクションの Source フィールド説明を読む  
**THEN** `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` 形式の参照が記述されている

---

### TC-005: TEST_CASES_TEMPLATE の Source フィールドが delta spec Scenario 参照形式を示す

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: test-cases.md テンプレートの Source フィールド説明は delta spec Scenario 参照を示さなければならない > Scenario: テンプレートの Source フィールド説明が更新されている

**GIVEN** `TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts`）を確認する  
**WHEN** Source フィールドの説明テキストを読む  
**THEN** delta spec の Scenario への参照形式（`specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>`）が記述されている

---

### TC-006: system prompt の Testable Behaviors Extraction が Scenario を primary source として指示する

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない > Scenario: system prompt が delta spec Scenario を primary source として指示する

**GIVEN** test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）を確認する  
**WHEN** Testable Behaviors Extraction セクションを読む  
**THEN** delta spec の Scenario が primary input source として明示されている

---

### TC-007: system prompt が design.md/tasks.md を supplementary context として位置づける

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない > Scenario: system prompt が delta spec Scenario を primary source として指示する

**GIVEN** test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）を確認する  
**WHEN** Testable Behaviors Extraction セクションを読む  
**THEN** design.md / tasks.md が supplementary（補助）文脈として位置づけられている

---

### TC-008: system prompt に delta spec 不在時のフォールバック指示がある

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない > Scenario: system prompt が delta spec Scenario を primary source として指示する

**GIVEN** test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）を確認する  
**WHEN** delta spec 不在時の挙動に関する記述を読む  
**THEN** `specs/` ディレクトリが存在しない場合に design.md / tasks.md からの抽出にフォールバックする旨が記述されている

---

### TC-009: initial message が specs/ 配下の delta spec 読み取り手順を含む

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: initial message は delta spec の読み取り手順を含まなければならない > Scenario: initial message が delta spec 読み取りを指示する

**GIVEN** `buildTestCaseGenInitialMessage` を任意の slug / branch / requestContent で呼び出す  
**WHEN** 生成された initial message を確認する  
**THEN** `specs/` 配下の delta spec ファイルを読み取る手順が含まれている

---

### TC-010: initial message の手順で delta spec が design.md/tasks.md より先に読まれる

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: initial message は delta spec の読み取り手順を含まなければならない > Scenario: initial message が delta spec 読み取りを指示する

**GIVEN** `buildTestCaseGenInitialMessage` を呼び出す  
**WHEN** 生成された initial message の手順リストの順序を確認する  
**THEN** delta spec（`specs/`）の読み取り手順が design.md / tasks.md の読み取り手順より前に記述されている

---

### TC-011: Coverage Requirements が Scenario 単位の網羅基準を示す

**Category**: unit
**Priority**: must
**Source**: specs/test-case-generator/spec.md > Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない > Scenario: system prompt が delta spec Scenario を primary source として指示する

**GIVEN** test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）を確認する  
**WHEN** Coverage Requirements セクションを読む  
**THEN** delta spec の各 Scenario に少なくとも 1 つの test case を対応させる旨の基準が記述されている

---

### TC-012: result determination が artifacts 完全不在時に failed とする

**Category**: unit
**Priority**: should
**Source**: specs/test-case-generator/spec.md > Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない > Scenario: system prompt が delta spec Scenario を primary source として指示する

**GIVEN** test-case-gen の system prompt の result determination を確認する  
**WHEN** `failed` 条件の記述を読む  
**THEN** delta spec が不在かつ design.md / tasks.md も不在の場合に `failed` とする条件が記述されている

---

## Result

```yaml
result: completed
total: 12
automated: 9
manual: 3
must: 11
should: 1
could: 0
blocked_reasons: []
```
