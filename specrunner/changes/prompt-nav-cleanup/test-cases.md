# Test Cases: prompt-nav-cleanup

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

- **Total**: 9 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 7, should: 2, could: 0

---

### TC-001: code-review-system.ts からナビゲーション文が削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/prompts/code-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `(See Pipeline Rules section below` を含む文字列が存在しない

---

### TC-002: code-review-system.ts の `## Pipeline Rules` 見出しが残っている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D1

**GIVEN** `src/prompts/code-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `## Pipeline Rules` 見出し行が存在する

---

### TC-003: code-review-system.ts の `## Review Process` セクションが続いている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `src/prompts/code-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `## Pipeline Rules` の後に `## Review Process` セクションが存在する

---

### TC-004: spec-review-system.ts からナビゲーション文が削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `src/prompts/spec-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `(See Pipeline Rules section below` を含む文字列が存在しない

---

### TC-005: spec-review-system.ts の `## Pipeline Rules` 見出しが残っている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md > D1

**GIVEN** `src/prompts/spec-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `## Pipeline Rules` 見出し行が存在する

---

### TC-006: spec-review-system.ts の `## Your Output` セクションが続いている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `src/prompts/spec-review-system.ts` が編集済みの状態
**WHEN** ファイルの内容を確認する
**THEN** `## Pipeline Rules` の後に `## Your Output` セクションが存在する

---

### TC-007: src/prompts/ 全体に `(See ... below)` 形式のナビ文が残っていない

**Category**: unit
**Priority**: must
**Source**: request.md > 受け入れ基準

**GIVEN** `src/prompts/` 配下の全ファイルが編集済みの状態
**WHEN** ディレクトリ全体を `(See Pipeline Rules section below` で検索する
**THEN** マッチする行が 0 件

---

### TC-008: 既存の fragment-coverage テストが修正なしで全 pass する

**Category**: integration
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-03

**GIVEN** ナビゲーション文のみ削除し、fragment-coverage.test.ts を変更していない状態
**WHEN** `bun run test` を実行する
**THEN** `src/prompts/__tests__/fragment-coverage.test.ts` の全テストケースが pass する

---

### TC-009: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 変更後のコードベース
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** exit code 0 で完了する

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
