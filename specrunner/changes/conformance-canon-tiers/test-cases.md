# Test Cases: conformance の正典の二層化

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 7
- **Manual**: 0
- **Priority**: must: 8, should: 0, could: 0

---

### TC-001: prompt が二層宣言の anchor 文字列を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: conformance prompt は request/spec を規範、design/tasks を計画として二層宣言する > Scenario: prompt が二層宣言の anchor 文字列を含む

---

### TC-002: prompt が非 finding 化と根拠引用の指示 anchor を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design/tasks との相違はそれ自体では finding にせず、finding の根拠は request/spec を引く > Scenario: prompt が非 finding 化と根拠引用の指示 anchor を含む

---

### TC-003: prompt が全件確認の指示を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 受け入れ基準と Requirement/Scenario の全件充足確認を維持する > Scenario: prompt が全件確認の指示を保持する

---

### TC-004: report tool の fixTarget enum が 3 値を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fixTarget enum と verdict 集約の機械意味論は不変である > Scenario: report tool の fixTarget enum が 3 値を保持する

---

### TC-005: verdict 導出と集約の既存挙動が保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fixTarget enum と verdict 集約の機械意味論は不変である > Scenario: verdict 導出と集約の既存挙動が保たれる

---

### TC-006: prompt 5節骨格と共有定数の埋め込みが維持される

**Category**: unit
**Priority**: must
**Source**: design.md D7 / tasks.md T-01 AC

**GIVEN** ビルド済みの `CONFORMANCE_SYSTEM_PROMPT` 文字列
**WHEN** 節見出しの順序と共有定数の埋め込みを検査する
**THEN** `## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion` がこの順序で存在し、`EVIDENCE_DISCIPLINE` と `SEVERITY_DEFINITION` の展開結果が含まれ、verdict 出力指示の禁止文字列および `architecture/` への参照が含まれない

---

### TC-007: buildMessage に checkbox 完了性 gate 表現が存在しない

**Category**: unit
**Priority**: must
**Source**: design.md D5 / tasks.md T-03 AC

**GIVEN** `conformance.ts` の `buildMessage` が生成するメッセージ文字列
**WHEN** checkbox 完了を conformance 合否 gate として要求する表現を探す
**THEN** 「verify all checkboxes are marked complete [x]」に相当する完了性 gate 表現が含まれない

---

### TC-008: typecheck && test green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-05 AC

`bun run typecheck && bun run test` — 既存テスト (TC-012 / TC-CONF-01〜03 / drift-guard / judge-verdict-conformance) が無変更のまま green であることを含む。

---

## Result

```yaml
result: completed
total: 8
automated: 7
manual: 0
must: 8
should: 0
could: 0
blocked_reasons: []
```
