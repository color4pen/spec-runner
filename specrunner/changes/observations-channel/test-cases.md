# Test Cases: judge report tool に observations チャネルを追加する

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 13, should: 9, could: 1

---

### TC-001: observations 付き report が受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge-family report tool は optional な observations チャネルを受理する > Scenario: observations 付き report が受理される

---

### TC-002: observation 要素は resolution を持たない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge-family report tool は optional な observations チャネルを受理する > Scenario: observation 要素は resolution を持たない

---

### TC-003: observations を足しても verdict が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings の契約は observations の有無に関わらず不変である > Scenario: observations を足しても verdict が変わらない

---

### TC-004: observations が code-fixer の findings ブロックに含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings の契約は observations の有無に関わらず不変である > Scenario: observations が code-fixer の findings ブロックに含まれない

---

### TC-005: observations が findings 台帳に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings の契約は observations の有無に関わらず不変である > Scenario: observations が findings 台帳に含まれない

---

### TC-006: critical な observation のみでも approved になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: observations の severity は記録専用で routing に使われない > Scenario: critical な observation のみでも approved になる

---

### TC-007: observations なしの report が従来通り読める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧形式 toolResult は後方互換に読める > Scenario: observations なしの report が従来通り読める

---

### TC-008: 不正な observations は report 全体を失敗させない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧形式 toolResult は後方互換に読める > Scenario: 不正な observations は report 全体を失敗させない

---

### TC-009: observation 定義が finding との境界禁止規律を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: observation 定義は judge-rules に集約され全 judge prompt に同梱される > Scenario: observation 定義が finding との境界禁止規律を含む

---

### TC-010: decision-needed 定義を注入する全 prompt が observation 定義も含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: observation 定義は judge-rules に集約され全 judge prompt に同梱される > Scenario: decision-needed 定義を注入する全 prompt が observation 定義も含む

---

### TC-011: `Observation` 型に `resolution` プロパティが型として存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/kernel/report-result.ts` に `Observation` interface が定義されている
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなく完了し、`Observation` 型のキーに `resolution` が存在しない（コンパイル時保証）

---

### TC-012: `parseObservations` が正常要素をすべてのフィールド込みで返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / T-03

**GIVEN** `[{ severity: "medium", file: "src/x.ts", line: 5, title: "T", rationale: "R" }]` を入力とする
**WHEN** `parseObservations` を呼ぶ
**THEN** `{ ok: true, value: [{ severity: "medium", file: "src/x.ts", line: 5, title: "T", rationale: "R" }] }` を返す

---

### TC-013: `parseObservations` が severity 不正要素に対して `ok: false` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / T-03

**GIVEN** `[{ severity: "unknown", file: "src/x.ts", title: "T", rationale: "R" }]` を入力とする
**WHEN** `parseObservations` を呼ぶ
**THEN** `{ ok: false }` を返す

---

### TC-014: `parseObservations` が `file` 欠落要素に対して `ok: false` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / T-03

**GIVEN** `[{ severity: "low", title: "T", rationale: "R" }]`（`file` なし）を入力とする
**WHEN** `parseObservations` を呼ぶ
**THEN** `{ ok: false }` を返す

---

### TC-015: `parseObservations` が `line: null` / `line` 欠落を正常処理する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / T-03

**GIVEN** `line: null` の要素と `line` キー自体がない要素をそれぞれ入力とする
**WHEN** `parseObservations` を呼ぶ
**THEN** いずれも `ok: true` を返し、parse 後の要素に `line` プロパティが存在しない（undefined）

---

### TC-016: `parseObservations` が空配列に対して `ok: true`・空 value を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / T-03

**GIVEN** 空配列 `[]` を入力とする
**WHEN** `parseObservations` を呼ぶ
**THEN** `{ ok: true, value: [] }` を返す

---

### TC-017: judge 系 3 tool の JSON Schema に `observations` フィールドが存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `JUDGE_REPORT_TOOL`・`CODE_REVIEW_REPORT_TOOL`・`REQUEST_REVIEW_REPORT_TOOL` の各定義
**WHEN** `toJSONSchema`（または `toCustomToolSpec`）を呼ぶ
**THEN** 例外を投げず、得られた JSON Schema の properties に `observations` が存在し、`resolution` を持たない要素スキーマになっている

---

### TC-018: producer 系 tool（`REPORT_TOOL` / `PRODUCER_REPORT_TOOL`）に `observations` が追加されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `REPORT_TOOL` および `PRODUCER_REPORT_TOOL` のスキーマ定義
**WHEN** スキーマを検査する
**THEN** いずれの properties にも `observations` キーが存在しない

---

### TC-019: codex strict 変換で `observations` が top-level required かつ nullable array になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D7

**GIVEN** `observations` を含む `JUDGE_REPORT_TOOL` の JSON Schema
**WHEN** `toOpenAIStrictSchema` を適用する
**THEN** top-level `required` に `"observations"` が含まれ、`observations` の型が nullable array（`["array", "null"]` 相当）になる

---

### TC-020: codex strict 変換で observation 要素の `line` が nullable、他フィールドは非 nullable になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D7

**GIVEN** observation 要素スキーマ（`severity`・`file`・`line?`・`title`・`rationale`）
**WHEN** `toOpenAIStrictSchema` を適用する
**THEN** `line` が nullable、`severity`・`file`・`title`・`rationale` が非 nullable、`resolution` が要素に存在しない

---

### TC-021: `stripNullDeep` が observation 要素の `line: null` を除去する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D7

**GIVEN** `{ severity: "low", file: "src/a.ts", line: null, title: "t", rationale: "r" }` を入力とする
**WHEN** `stripNullDeep` を適用する
**THEN** 結果オブジェクトに `line` キーが存在しない

---

### TC-022: `StepOutcome.toolResult` に `observations` を含むオブジェクトを代入しても型エラーがない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D2

**GIVEN** `BaseReportResult` フィールド + `findings: Finding[]` + `observations: Observation[]` を持つオブジェクト
**WHEN** `bun run typecheck` を実行する
**THEN** `StepOutcome.toolResult` への代入で型エラーが発生しない

---

### TC-023: judge 系 tool の description に observations の用途が記述される

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04

**GIVEN** `JUDGE_REPORT_TOOL`・`CODE_REVIEW_REPORT_TOOL`・`REQUEST_REVIEW_REPORT_TOOL` の description 文字列
**WHEN** 各 description を検査する
**THEN** 「対応不要だが記録したい観察」または同旨の記述と「verdict には影響しない」旨が含まれる

---

## Result

```yaml
result: completed
total: 23
automated: 23
manual: 0
must: 13
should: 9
could: 1
blocked_reasons: []
```
