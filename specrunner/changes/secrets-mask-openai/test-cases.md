# Test Cases:

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

- **Total**: 12 cases
- **Automated** (unit/integration): 10
- **Manual**: 2
- **Priority**: must: 8, should: 4, could: 0

---

### TC-001: sk-proj- キーがマスクされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: OpenAI 系 API キーをマスクする > Scenario: sk-proj- キーがマスクされる

---

### TC-002: sk-svcacct- キーがマスクされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: OpenAI 系 API キーをマスクする > Scenario: sk-svcacct- キーがマスクされる

---

### TC-003: 汎用 sk- キー（20 文字以上）がマスクされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: OpenAI 系 API キーをマスクする > Scenario: 汎用 sk- キー（20 文字以上）がマスクされる

---

### TC-004: 短い sk- 文字列はマスクされない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: OpenAI 系 API キーをマスクする > Scenario: 短い sk- 文字列はマスクされない

---

### TC-005: sk-ant- キーが既存と同じ形式でマスクされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存パターンの挙動を維持する > Scenario: sk-ant- キーが既存と同じ形式でマスクされる

---

### TC-006: gh*_ / github_pat_ キーがマスクされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存パターンの挙動を維持する > Scenario: gh*_ / github_pat_ キーがマスクされる

---

### TC-007: MASK_PATTERNS が合計 6 エントリである

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/logger/stdout.ts` の `MASK_PATTERNS` 配列が更新されている
**WHEN** `MASK_PATTERNS` のエントリ数を確認する
**THEN** 配列の長さが 6 である

---

### TC-008: 複数キーが混在する文字列で全てがマスクされる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 出力文字列に `sk-ant-api03-abcdef`、`sk-proj-abcdefghijklmnopqrstu`、`ghp_ABCDEFGHIJKLMNOPQRSTU` が混在している
**WHEN** `maskSensitive` を適用する
**THEN** 3 つ全てが短縮形に置換され、それ以外の文字はそのまま残る

---

### TC-009: キーを含まない文字列はそのまま返る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 出力文字列がいずれのパターンにもマッチしない（例: `"hello world"`）
**WHEN** `maskSensitive` を適用する
**THEN** 入力文字列がそのまま返る

---

### TC-010: 既存テストファイルが無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `src/logger/__tests__/log-retention.test.ts` および `src/logger/__tests__/pipeline-logger.test.ts` が変更されていない
**WHEN** `bun run test` を実行する
**THEN** これらのテストファイルの全テストが通過する

---

### TC-011: typecheck が 0 exit で完了する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/logger/stdout.ts` が変更済みである
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript コンパイラがエラーなく終了し、exit code が 0 である

---

### TC-012: test スイート全体が 0 exit で完了する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/logger/stdout.ts` および `src/logger/__tests__/mask-sensitive.test.ts` が変更済みである
**WHEN** `bun run test` を実行する
**THEN** 全テストが通過し、exit code が 0 である

---

## Result

```yaml
result: completed
total: 12
automated: 10
manual: 2
must: 8
should: 4
could: 0
blocked_reasons: []
```
