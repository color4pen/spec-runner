# Test Cases: request-review parse 失敗時の診断コンテキスト保持

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 8
- **Manual**: 1
- **Priority**: must: 6, should: 2, could: 1

---

### TC-001: 壊れた JSON で parse error message と raw output が残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 失敗時に finding description へ診断コンテキストを含める > Scenario: 壊れた JSON で parse error message と raw output が残る

---

### TC-002: 空文字列でも raw output セクションが残り区別可能になる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: parse 失敗時に finding description へ診断コンテキストを含める > Scenario: 空文字列でも raw output セクションが残り区別可能になる

---

### TC-003: 500 文字超の output が truncate される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: raw output は 500 文字に truncate する > Scenario: 500 文字超の output が truncate される

---

### TC-004: parse 失敗で stderr に warning が出る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 失敗時に stderr へ warning を出力する > Scenario: parse 失敗で stderr に warning が出る

---

### TC-005: 正常 parse では warning なしで構造化結果を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parse 成功時の挙動は不変 > Scenario: 正常 parse では warning なしで構造化結果を返す

---

### TC-006: verdict フィールド欠落の valid JSON でも parse-error finding が返る

**Category**: unit
**Priority**: should
**Source**: design.md > D1: 失敗診断は fallback パス全体に適用し、parse error message は catch で捕捉する

**GIVEN** reviewer の出力が valid JSON だが `verdict` フィールドを含まない `` ```json `` ブロックを持つ
**WHEN** `parseReviewOutput` が呼ばれる
**THEN** 戻り値の `verdict` は `"needs-discussion"` である
**AND** `findings` に category `"parse-error"` の finding が存在する
**AND** その finding の `description` は `parseError` なし（`"Parse error:"` を含まない）だが raw output セクションを含む

---

### TC-007: parse 失敗時も summary は PARSE_FAILURE_SUMMARY のまま変わらない

**Category**: unit
**Priority**: should
**Source**: design.md > D6: summary は PARSE_FAILURE_SUMMARY を維持する

**GIVEN** reviewer の出力が parse 不能（malformed JSON）である
**WHEN** `parseReviewOutput` が呼ばれる
**THEN** 戻り値の `summary` は `PARSE_FAILURE_SUMMARY` 定数と等しい
**AND** `summary` に raw output は含まれない

---

### TC-008: finding description の raw snippet に maskSensitive が適用される

**Category**: unit
**Priority**: could
**Source**: design.md > D5: finding description の raw snippet にも maskSensitive を適用する

**GIVEN** reviewer の raw output に `maskSensitive` がマスクする機微パターン（例: `sk-ant-*****` 形式の仮トークン）が含まれ、JSON parse が失敗する
**WHEN** `parseReviewOutput` が呼ばれる
**THEN** finding の `description` 内の raw snippet は機微パターンがマスクされた文字列である
**AND** 元の機微文字列はそのまま含まれない

---

### TC-009: 品質ゲート（typecheck / test / lint）が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03: 品質ゲートを green にする

**GIVEN** `src/core/request/reviewer.ts` と `tests/unit/core/request/reviewer.test.ts` の変更が完了している
**WHEN** `bun run typecheck && bun run test` および `bun run lint` を実行する
**THEN** すべてのコマンドが exit 0 で完了する
**AND** lint は warning 0 である

---

## Result

```yaml
result: completed
total: 9
automated: 8
manual: 1
must: 6
should: 2
could: 1
blocked_reasons: []
```
