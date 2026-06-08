# Test Cases: test-coverage-extensions

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
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 7
- **Manual**: 3
- **Priority**: must: 7, should: 2, could: 1

---

### TC-001: 追加 JS/JSX 拡張子が収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する > Scenario: 追加 JS/JSX 拡張子が収集される

---

### TC-002: 追加 TSX 拡張子が収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する > Scenario: 追加 TSX 拡張子が収集される

---

### TC-003: 追加 ESM 明示拡張子が収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する > Scenario: 追加 ESM 明示拡張子が収集される

---

### TC-004: 既存 .test.ts / .spec.ts が引き続き収集される（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する > Scenario: 既存 .test.ts / .spec.ts が引き続き収集される（後方互換）

---

### TC-005: test 拡張子に該当しないファイルは収集されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する > Scenario: test 拡張子に該当しないファイルは収集されない

---

### TC-006: .test.js に記載された must TC ID が found になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 追加拡張子の test ファイルに記載された must TC ID が found になる > Scenario: .test.js に記載された must TC ID が found になる

---

### TC-007: .test.tsx に記載された must TC ID が found になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 追加拡張子の test ファイルに記載された must TC ID が found になる > Scenario: .test.tsx に記載された must TC ID が found になる

---

### TC-008: TEST_FILE_EXTENSIONS 定数が module スコープに定義されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D1, D2

**GIVEN** `src/core/verification/test-coverage.ts` の実装がある
**WHEN** ファイルを開き module スコープを確認する
**THEN** `const TEST_FILE_EXTENSIONS = [...] as const` が `SKIP_DIRS` と同列の module スコープに定義されており、export されていない

---

### TC-009: collectProjectTestFiles のフィルタが some() 判定になっている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D1

**GIVEN** `src/core/verification/test-coverage.ts` の実装がある
**WHEN** ファイル内のフィルタ判定箇所を確認する
**THEN** `TEST_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))` の形になっており、inline の `endsWith` OR 連結（`entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")` 等）が残っていない

---

### TC-010: doc comment と JSDoc が拡張子追加を反映している

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** `src/core/verification/test-coverage.ts` の実装がある
**WHEN** ファイル先頭の doc comment と `collectProjectTestFiles` の JSDoc を確認する
**THEN** `.test.ts` / `.spec.ts` のみに言及した古い記述が残っておらず、対応拡張子の拡大を反映した内容に更新されている

---

## Result

```yaml
result: completed
total: 10
automated: 7
manual: 3
must: 7
should: 2
could: 1
blocked_reasons: []
```
