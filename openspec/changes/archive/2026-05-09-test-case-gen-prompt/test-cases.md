# Test Cases: test-case-gen prompt 強化

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration/e2e): 20
- **Manual**: 0
- **Priority**: must: 16, should: 4, could: 0

---

## T-1: system prompt の拡張

### TC-001: system prompt に Category キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D1 テストケースフォーマット

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `Category` というキーワードが含まれている

---

### TC-002: system prompt に Source キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D1 テストケースフォーマット

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `Source` というキーワードが含まれている

---

### TC-003: system prompt に Summary キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D3 Summary セクション

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `Summary` というキーワードが含まれている

---

### TC-004: system prompt に blocked_reasons キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D4 blocked_reasons

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `blocked_reasons` または `Blocked Reasons` というキーワードが含まれている

---

### TC-005: system prompt に Result キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D6 構造化戻り値

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `Result` というキーワードが含まれている

---

### TC-006: system prompt に must-areas キーワードが含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 受け入れ基準 / D5 must-areas

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `must-areas` というキーワードが含まれている

---

### TC-007: system prompt に Category 判定テーブル（unit/integration/e2e/manual）が含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 §2 Category 判定テーブル / D2

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `unit`, `integration`, `e2e`, `manual` の 4 値すべてが含まれている

---

### TC-008: system prompt に Testable Behaviors 抽出の 4 観点が含まれる

**Category**: unit
**Priority**: must
**Source**: T-1 §4 Testable Behaviors 抽出の観点 / D7

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** ドメインロジック, API コントラクト, データ整合性, エッジケースに相当する語句がそれぞれ含まれている

---

### TC-009: system prompt が旧フォーマット (`TC-001 [must]`) を含まない

**Category**: unit
**Priority**: should
**Source**: D1 変更点（旧インライン表記の廃止）

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** 旧フォーマット `[must]` インライン表記を検索する
**THEN** 出力フォーマットとして `[must]` が使用されていない（または新フォーマットとして `**Priority**:` が用いられている）

---

### TC-010: completed / partial / failed の判定基準が system prompt に記述されている

**Category**: unit
**Priority**: should
**Source**: T-1 §6 Result セクション / D6 判定基準

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が定義されている
**WHEN** prompt 文字列を検査する
**THEN** `completed`, `partial`, `failed` の 3 値がすべて含まれている

---

## T-2: TestCaseGenMessageInput の拡張と initial message builder の変更

### TC-011: TestCaseGenMessageInput に enabled フィールドが追加されている

**Category**: unit
**Priority**: must
**Source**: T-2 §1 interface 変更 / D5 TestCaseGenMessageInput の変更

**GIVEN** `TestCaseGenMessageInput` 型が定義されている
**WHEN** 型チェック (`bun run typecheck`) を実行する
**THEN** `enabled: string[]` フィールドを持つオブジェクトが型エラーなく渡せる

---

### TC-012: enabled が非空の場合 buildTestCaseGenInitialMessage は `<must-areas>` セクションを含む

**Category**: unit
**Priority**: must
**Source**: T-2 §2 buildTestCaseGenInitialMessage 変更 / D5

**GIVEN** `enabled: ["security"]` を指定した `TestCaseGenMessageInput`
**WHEN** `buildTestCaseGenInitialMessage` を呼び出す
**THEN** 返り値に `<must-areas>` と `security` が含まれている

---

### TC-013: enabled が空配列の場合 buildTestCaseGenInitialMessage は `<must-areas>` セクションを省略する

**Category**: unit
**Priority**: must
**Source**: T-2 §2 buildTestCaseGenInitialMessage 変更 / D5

**GIVEN** `enabled: []` を指定した `TestCaseGenMessageInput`
**WHEN** `buildTestCaseGenInitialMessage` を呼び出す
**THEN** 返り値に `<must-areas>` が含まれていない

---

### TC-014: buildTestCaseGenInitialMessage のメッセージに proposal.md 読み取り指示が含まれる

**Category**: unit
**Priority**: must
**Source**: T-2 §2 buildTestCaseGenInitialMessage 変更

**GIVEN** 任意の `TestCaseGenMessageInput`
**WHEN** `buildTestCaseGenInitialMessage` を呼び出す
**THEN** 返り値に `proposal.md` への参照が含まれている

---

### TC-015: enabled に複数値を指定した場合すべての値が `<must-areas>` に含まれる

**Category**: unit
**Priority**: should
**Source**: T-2 §2 buildTestCaseGenInitialMessage 変更 / D5

**GIVEN** `enabled: ["security", "performance"]` を指定した `TestCaseGenMessageInput`
**WHEN** `buildTestCaseGenInitialMessage` を呼び出す
**THEN** 返り値に `<must-areas>` が含まれ、`security` と `performance` の両方が含まれている

---

## T-3: test-case-gen.ts の buildMessage 変更

### TC-016: buildMessage が deps.request.enabled を message builder に渡す

**Category**: unit
**Priority**: must
**Source**: T-3 buildMessage 変更 / D5

**GIVEN** `deps.request.enabled = ["security"]` を設定した `StepDeps`
**WHEN** `TestCaseGenStep.buildMessage(state, deps)` を呼び出す
**THEN** 返り値に `<must-areas>` と `security` が含まれている

---

### TC-017: buildMessage が deps.request.enabled = [] の場合 `<must-areas>` を含まない

**Category**: unit
**Priority**: must
**Source**: T-3 buildMessage 変更 / D5

**GIVEN** `deps.request.enabled = []` を設定した `StepDeps`
**WHEN** `TestCaseGenStep.buildMessage(state, deps)` を呼び出す
**THEN** 返り値に `<must-areas>` が含まれていない

---

### TC-018: buildMessage は branch が null のとき BRANCH_NOT_SET エラーを投げる（既存の振る舞いを維持）

**Category**: unit
**Priority**: should
**Source**: T-3 buildMessage 変更（既存 fail-fast の維持）

**GIVEN** `state.branch = null`
**WHEN** `TestCaseGenStep.buildMessage(state, deps)` を呼び出す
**THEN** `code: "BRANCH_NOT_SET"` を持つエラーが投げられる

---

## T-4: テストの更新

### TC-019: bun run typecheck が 0 errors で終了する

**Category**: integration
**Priority**: must
**Source**: T-4 受け入れ基準 / design.md 受け入れ基準

**GIVEN** T-1〜T-3 の変更がすべて適用されたソースツリー
**WHEN** `bun run typecheck` を実行する
**THEN** エラーが 0 件で終了する

---

### TC-020: bun run test が全件 green になる

**Category**: integration
**Priority**: must
**Source**: T-4 受け入れ基準 / design.md 受け入れ基準

**GIVEN** T-1〜T-3 の変更がすべて適用されたソースツリー
**WHEN** `bun run test` を実行する
**THEN** 全テストケースが PASS し、失敗が 0 件である

---

## Blocked Reasons

None

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 16
should: 4
could: 0
blocked_reasons: []
```
