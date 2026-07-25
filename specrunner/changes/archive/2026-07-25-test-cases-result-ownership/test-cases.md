# Test Cases: test-cases.md の Result YAML の所有権を test-case-gen に固定する

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 7
- **Manual**: 0
- **Priority**: must: 6, should: 1, could: 0

---

### TC-001: TEST_CASES_TEMPLATE Result ブロックコメントに所有者・書込時点・enum 意味が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TEST_CASES_TEMPLATE の Result ブロックコメントは所有者・書込時点・enum 意味を宣言する > Scenario: Result ブロックコメントに所有者・書込時点・enum 意味が含まれる

---

### TC-002: test-case-gen prompt に enum 意味と確定規則が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen system prompt は result の enum 意味と確定規則を宣言する > Scenario: test-case-gen prompt に enum 意味と確定規則が含まれる

---

### TC-003: test-materialize prompt に Result YAML 非更新の記述が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize system prompt は Result YAML の実装完了後非更新を宣言する > Scenario: test-materialize prompt に Result YAML 非更新の記述が含まれる

---

### TC-004: docstring に Result YAML の machine-parsed 記述が残っていない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TEST_CASES_TEMPLATE の docstring は machine-parse の実態に整合する > Scenario: docstring に Result YAML の machine-parsed 記述が残っていない

---

### TC-005: 既存テストが無改変で green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 意味の確定は schema・write-scope・coverage の挙動を変えない > Scenario: 既存テストが無改変で green

---

### TC-006: typecheck && フルテストスイートが green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** T-01〜T-05 の変更をすべて適用した後のコードベース（新規テストファイルを含む）
**WHEN** `typecheck && test` を実行する
**THEN** 型エラーが 0 件であり、新規テスト・既存テスト含む全件が green である

---

### TC-007: 禁止文字列が変更後の各ファイルに含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01, T-03

**GIVEN** 変更後の `TEST_CASES_TEMPLATE`・`TEST_CASE_GEN_SYSTEM_PROMPT`・`TEST_MATERIALIZE_SYSTEM_PROMPT` の文字列
**WHEN** `"result determination:"`・`"Category determination:"`・`"Priority determination:"` の存在を各文字列で検査する
**THEN** いずれの文字列においても禁止文字列は 1 件も存在しない

---

## Result

```yaml
result: completed
total: 7
automated: 7
manual: 0
must: 6
should: 1
could: 0
blocked_reasons: []
```
