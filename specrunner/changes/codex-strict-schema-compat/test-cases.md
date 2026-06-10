# Test Cases: codex adapter の outputSchema を OpenAI strict mode 互換に変換する

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 13
- **Manual**: 1
- **Priority**: must: 10, should: 4, could: 0

---

### TC-001: top-level optional fields become required and nullable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL convert the report_result outputSchema to OpenAI strict-mode form > Scenario: top-level optional fields become required and nullable

---

### TC-002: nested findings item optional field becomes required and nullable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL convert the report_result outputSchema to OpenAI strict-mode form > Scenario: nested findings item optional field becomes required and nullable

---

### TC-003: union-typed optional field gets a null branch

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL convert the report_result outputSchema to OpenAI strict-mode form > Scenario: union-typed optional field gets a null branch

---

### TC-004: scalar optional null parses identically to undefined

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL normalize null optional fields before parsing tool results > Scenario: scalar optional null parses identically to undefined

---

### TC-005: findings line null does not invalidate the findings array

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex adapter SHALL normalize null optional fields before parsing tool results > Scenario: findings line null does not invalidate the findings array

---

### TC-006: Claude-side CustomToolSpec output is unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the conversion SHALL be confined to the codex adapter > Scenario: Claude-side CustomToolSpec output is unchanged

---

### TC-007: toOpenAIStrictSchema does not mutate the input schema

**Category**: unit
**Priority**: should
**Source**: design.md > D2, tasks.md > T-01 Acceptance Criteria

**GIVEN** JUDGE_REPORT_TOOL の zodSchema から生成した JSON Schema オブジェクト（元の `required: ["ok"]` を持つ）
**WHEN** `toOpenAIStrictSchema(schema)` を呼び出す
**THEN** 呼び出し後も入力オブジェクトの `required` は `["ok"]` のままで変化していない
**AND** 入力の properties に nullable 化が行われていない

---

### TC-008: additionalProperties: false が変換後も保持される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `additionalProperties: false` を持つ JUDGE_REPORT_TOOL の JSON Schema
**WHEN** `toOpenAIStrictSchema(schema)` を適用する
**THEN** 変換後の top-level schema に `additionalProperties: false` が保持されている
**AND** findings item の nested object にも `additionalProperties: false` が保持されている

---

### TC-009: stripNullDeep がフラットオブジェクトの null 値 key を除去する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `{ ok: true, reason: null }` という入力オブジェクト
**WHEN** `stripNullDeep({ ok: true, reason: null })` を呼び出す
**THEN** 戻り値が `{ ok: true }` であり、`reason` key が存在しない

---

### TC-010: stripNullDeep が配列要素内の null 値 key を再帰除去する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `{ ok: true, findings: [{ severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r", line: null }] }` という入力
**WHEN** `stripNullDeep(input)` を呼び出す
**THEN** 戻り値の `findings[0]` に `line` key が存在しない
**AND** `findings[0]` の他のフィールド（severity / resolution / file / title / rationale）は保持されている

---

### TC-011: stripNullDeep が入力オブジェクトを mutate しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `{ ok: true, reason: null, findings: [{ line: null }] }` という入力オブジェクトの参照
**WHEN** `stripNullDeep(input)` を呼び出す
**THEN** 呼び出し後も入力オブジェクトの `reason` は `null` のまま変化していない
**AND** `findings[0].line` も `null` のまま変化していない

---

### TC-012: reportTool 未設定時に outputSchema を渡さない既存挙動が維持される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `reportTool` が undefined（出力スキーマ不要な step）の codex agent-runner
**WHEN** `buildOutputSchema(undefined)` を評価する
**THEN** 戻り値が `undefined` であり、`thread.run()` に `outputSchema` が渡されない

---

### TC-013: typecheck (tsc) が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** T-01〜T-07 の実装が完了した状態
**WHEN** `typecheck`（tsc）を実行する
**THEN** 型エラーが 0 件で終了する

---

### TC-014: 既存の codex / report-result テストにリグレッションがない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** T-01〜T-07 の実装が完了した状態
**WHEN** vitest で既存の codex agent-runner テストおよび report-result テストを実行する
**THEN** 既存テストが全て green のまま通過する

---

## Result

```yaml
result: completed
total: 14
automated: 13
manual: 1
must: 10
should: 4
could: 0
blocked_reasons: []
```
