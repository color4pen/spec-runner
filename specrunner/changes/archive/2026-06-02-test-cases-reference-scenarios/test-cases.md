# Test Cases: test-cases.md GWT 二重持ち解消

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to delta spec Scenario (specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

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
    failed    — delta spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 8
- **Manual**: 0
- **Priority**: must: 6, should: 2, could: 0

### TC-001: Scenario 由来 TC が GWT を省略し Source 参照のみで記述される

- **Category**: integration
- **Priority**: must
- **Source**: specs/test-case-generator/spec.md > Requirement: test-cases.md の Scenario 由来 TC は GWT を再記述せず Source 参照のみとしなければならない > Scenario: Scenario 由来 TC が GWT を省略し Source 参照のみで記述される

### TC-002: Scenario 由来 TC に GWT が再記述されている場合は違反

- **Category**: integration
- **Priority**: must
- **Source**: specs/test-case-generator/spec.md > Requirement: test-cases.md の Scenario 由来 TC は GWT を再記述せず Source 参照のみとしなければならない > Scenario: Scenario 由来 TC に GWT が再記述されている場合は違反

### TC-003: 非 Scenario 由来 TC が従来通り GWT を保持する

- **Category**: integration
- **Priority**: must
- **Source**: specs/test-case-generator/spec.md > Requirement: 非 Scenario 由来の補助 TC は従来通り GWT を記述しなければならない > Scenario: 非 Scenario 由来 TC が従来通り GWT を保持する

### TC-004: テンプレートコメントに混在形式が記載されている

- **Category**: unit
- **Priority**: must
- **Source**: specs/test-case-generator/spec.md > Requirement: TEST_CASES_TEMPLATE のコメントに混在形式を明記しなければならない > Scenario: テンプレートコメントに混在形式が記載されている

### TC-005: implementer が Source パスから delta spec の GWT を取得してテストを書く

- **Category**: integration
- **Priority**: must
- **Source**: specs/test-case-generator/spec.md > Requirement: implementer は delta spec の Scenario から GWT を読んでテストを実装しなければならない > Scenario: implementer が Source パスから delta spec の GWT を取得してテストを書く

### TC-006: TEST_CASE_GEN_BASE の Test Case Format が Scenario 由来 TC で GWT を省略する指示になっている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-02: test-case-gen system prompt を GWT 省略指示に更新

**GIVEN** `src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_BASE` を確認する  
**WHEN** `Test Case Format` セクションおよび `buildTestCaseGenInitialMessage` の手順 5 を読む  
**THEN** Scenario 由来 TC では GWT を記述せず Source 参照のみとする指示が含まれており、`in GIVEN/WHEN/THEN format` の無条件記述が除去または条件付きに変更されている

### TC-007: implementer system prompt に delta spec Scenario 参照フローが記載されている

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03: implementer system prompt を delta spec Scenario 参照フローに更新

**GIVEN** `src/prompts/implementer-system.ts` の実装手順を確認する  
**WHEN** Scenario 由来 TC の実装フロー記述を読む  
**THEN** Source フィールドのパス（`specs/<capability>/spec.md`）を Read tool で開き delta spec の Scenario から GWT を取得する手順が明示されており、非 Scenario 由来 TC では従来通り test-cases.md の GWT を使う手順が維持されている

### TC-008: typecheck と test が green

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md > T-05: typecheck & test green 確認

**GIVEN** T-01〜T-04 の実装が完了した状態のコードベース  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit code 0 で完了し、既存テストが壊れていない

## Result

```yaml
result: completed
total: 8
automated: 8
manual: 0
must: 6
should: 2
could: 0
blocked_reasons: []
```
