# Test Cases: remove-context-orphan

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

- **Total**: 10 cases
- **Automated** (unit/integration): 0
- **Manual**: 10
- **Priority**: must: 9, should: 1, could: 0

---

### TC-001: src/context/ ディレクトリが完全に削除されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `ls src/context/` を実行する  
**THEN** "No such file or directory" エラーが返り、ディレクトリが存在しない

---

### TC-002: src/context/request-patterns.ts が削除されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `ls src/context/request-patterns.ts` を実行する  
**THEN** "No such file or directory" エラーが返り、ファイルが存在しない

---

### TC-003: tests/unit/context/ ディレクトリが完全に削除されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `ls tests/unit/context/` を実行する  
**THEN** "No such file or directory" エラーが返り、ディレクトリが存在しない

---

### TC-004: tests/unit/context/request-patterns.test.ts が削除されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `ls tests/unit/context/request-patterns.test.ts` を実行する  
**THEN** "No such file or directory" エラーが返り、ファイルが存在しない

---

### TC-005: collectRequestPatterns を参照する production code が存在しない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, design.md D2

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `grep -r "collectRequestPatterns" src/` を実行する  
**THEN** 結果が 0 件（マッチなし）

---

### TC-006: RequestPattern を参照する production code が存在しない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, design.md D2

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `grep -r "RequestPattern" src/` を実行する  
**THEN** 結果が 0 件（マッチなし）

---

### TC-007: request-patterns を参照する src/ 配下ファイルが存在しない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, design.md D2

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `grep -r "request-patterns" src/` を実行する  
**THEN** 結果が 0 件（マッチなし）

---

### TC-008: bun run build / typecheck / lint が成功する

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `bun run build && bun run typecheck && bun run lint` を実行する  
**THEN** 3 コマンドすべてが exit code 0 で完了し、エラー出力がない

---

### TC-009: bun run test が成功する（削除ファイルを除くテストスイート全体）

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** 変更適用後のリポジトリ（tests/unit/context/ が削除済み）  
**WHEN** `bun run test` を実行する  
**THEN** exit code 0 で完了し、テストスイート全体が green。削除されたテストファイルが "missing" や "failed" として報告されない

---

### TC-010: archive design.md が誤って削除・変更されていない

**Category**: manual
**Priority**: should
**Source**: request.md 背景セクション（`2026-05-08-request-command-redesign/design.md:108` retain 決定）

**GIVEN** 変更適用後のリポジトリ  
**WHEN** `git diff main -- specrunner/changes/` または該当 archive ディレクトリを確認する  
**THEN** `2026-05-08-request-command-redesign/design.md` が変更されておらず、retain 決定の記録が保持されている

---

## Result

```yaml
result: completed
total: 10
automated: 0
manual: 10
must: 9
should: 1
could: 0
blocked_reasons: []
```
