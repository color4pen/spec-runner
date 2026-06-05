# Test Cases: request review JSON-only output と parse 失敗判別

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 9, should: 2, could: 1

---

### TC-001: prompt が二重出力を要求しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer の出力契約は構造化 JSON 一本である > Scenario: prompt が二重出力を要求しない

---

### TC-002: JSON と Markdown の一致強制が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer の出力契約は構造化 JSON 一本である > Scenario: JSON と Markdown の一致強制が存在しない

---

### TC-003: JSON ブロックが存在しない → fallback は固定診断文 + parse-error finding

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 失敗は確定レビューに偽装してはならない > Scenario: JSON ブロックが存在しない

---

### TC-004: JSON が truncation で途中まで → fallback path + parse-error finding

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 失敗は確定レビューに偽装してはならない > Scenario: JSON が truncation で途中まで

---

### TC-005: JSON が malformed → fallback + parse-error finding

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 失敗は確定レビューに偽装してはならない > Scenario: JSON が malformed

---

### TC-006: 正常な末尾 JSON を抽出する（number 補完含む）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 正常な末尾 JSON は決定的にパースされ、表示と exit code は不変である > Scenario: 正常な末尾 JSON を抽出する

---

### TC-007: 表示形式と exit code が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 正常な末尾 JSON は決定的にパースされ、表示と exit code は不変である > Scenario: 表示形式と exit code が不変

---

### TC-008: `JSON block MUST be the last block` 制約が prompt に保持されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** request-review の system prompt の `## Output Format` 節  
**WHEN** 出力 artifact に関する制約を検査する  
**THEN** 「JSON block MUST be the last block」相当の制約が存在し、削除されていない

---

### TC-009: JSON ブロック前の散文を最小限にする旨が prompt に明示されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01（design.md > D2 対応）

**GIVEN** request-review の system prompt  
**WHEN** JSON ブロック出力に関する指示を検査する  
**THEN** JSON ブロック手前の散文（前置き）を最小限に抑えるよう指示する文が存在する

---

### TC-010: `bun run typecheck && bun run test` が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** 変更が適用されたコードベース  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit code 0 で完了する

---

### TC-011: `RequestReviewVerdict` union に新 verdict 値が追加されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** `RequestReviewVerdict` 型定義（`src/core/request/reviewer.ts` または共通型ファイル）  
**WHEN** union の値一覧を検査する  
**THEN** `approve` / `needs-discussion` / `reject` の 3 値のみであり、新 verdict 値が追加されていない

---

### TC-012: （manual）長い findings を持つ request.md で複数回 review しても parse-error fallback に落ちない

**Category**: manual
**Priority**: could
**Source**: request.md 受け入れ基準（integration/手動、`bun run test` 対象外）

**GIVEN** findings が多く出力が長くなる request.md を用意する  
**WHEN** `specrunner request review` を同一 request.md に対して複数回（3 回以上）実行する  
**THEN** すべての回で `[HIGH] parse-error` の finding が出力されず、verdict が安定して返る

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 9
should: 2
could: 1
blocked_reasons: []
```
