# Test Cases: code-fixer への approved 時 routing を findings から導出する

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 14
- **Manual**: 2
- **Priority**: must: 11, should: 5, could: 0

---

## Routing — approved → code-fixer / conformance

### TC-001: approved + fixable findings あり → code-fixer

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: approved 後の code-fixer routing は findings の fixable 件数から決まる > Scenario: approved + fixable findings あり → code-fixer

### TC-002: approved + fixable findings なし → conformance

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: approved 後の code-fixer routing は findings の fixable 件数から決まる > Scenario: approved + fixable findings なし → conformance

### TC-003: fixableCount=0 かつ fixable findings あり → findings に従い code-fixer

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: approved 後の code-fixer routing は findings の fixable 件数から決まる > Scenario: fixableCount と findings が矛盾するとき findings に従う

### TC-004: fixableCount=3 かつ findings 不在 → findings に従い conformance

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: approved 後の code-fixer routing は findings の fixable 件数から決まる > Scenario: fixableCount だけ残る旧 state は findings 不在で conformance に倒れる

### TC-005: toolResult が null のとき when 述語は false を返す

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-06 AC

**GIVEN** `STANDARD_TRANSITIONS` の `code-review approved → code-fixer` `when` 述語を、`outcome.toolResult: null` の code-review 最終 run を持つ state で呼ぶ  
**WHEN** `when(state)` を実行する  
**THEN** `false` を返す（toolResult が取得できなくても例外を投げない）

### TC-006: STANDARD_TRANSITIONS の行数が 31 のまま不変

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-02 AC / design.md > D5

**GIVEN** `STANDARD_TRANSITIONS` 配列をインポートする  
**WHEN** `.length` を取得する  
**THEN** `31` を返す（approved → code-fixer `when` 本体の差し替えのみで行の追加・削除が生じていない）

---

## Pure Function — collectFixableFindings

### TC-007: resolution: "fixable" の findings のみを返す

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: fixable findings の集計は純関数として提供される > Scenario: fixable のみを抽出する

### TC-008: 空配列入力で空配列を返す

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: fixable findings の集計は純関数として提供される > Scenario: 空入力は空を返す

### TC-009: fixable と decision-needed が混在するとき fixable のみ返す

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-05 AC

**GIVEN** `[{ resolution: "fixable" }, { resolution: "decision-needed" }]` を `collectFixableFindings` に渡す  
**WHEN** 関数を呼ぶ  
**THEN** `resolution: "fixable"` の 1 件のみが返り、`decision-needed` は含まれない

### TC-010: decision-needed のみの入力で空配列を返す

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-05 AC

**GIVEN** `[{ resolution: "decision-needed" }, { resolution: "decision-needed" }]` を `collectFixableFindings` に渡す  
**WHEN** 関数を呼ぶ  
**THEN** 空配列 `[]` を返す

---

## Tool Description — fixableCount 言及の除去

### TC-011: CODE_REVIEW_REPORT_TOOL.description に fixableCount が現れない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: code-review tool description は fixableCount の申告を要求しない > Scenario: description に fixableCount が現れない

### TC-012: fixableCount を含む入力が parse で受理され fixableCount 値が維持される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: code-review tool description は fixableCount の申告を要求しない > Scenario: fixableCount を含む入力は parse で受理されるが routing に影響しない

---

## Code Fixer Prompt — findings の埋め込み

### TC-013: low/medium fixable findings が code-fixer の prompt 本文に埋め込まれる

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: approved 経由で code-fixer に入ると low/medium fixable findings が prompt に渡る > Scenario: low/medium fixable findings が code-fixer prompt に埋め込まれる

---

## Backward Compatibility

### TC-014: toCustomToolSpec が CODE_REVIEW_REPORT_TOOL から例外なく JSON Schema を生成する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03 AC

**GIVEN** `CODE_REVIEW_REPORT_TOOL` を `toCustomToolSpec` に渡す（`fixableCount` は zod スキーマに残存）  
**WHEN** JSON Schema 生成を実行する  
**THEN** 例外なく schema オブジェクトが返り、`fixableCount` プロパティが schema の properties に含まれる

---

## Manual Checks

### TC-015: code-review system prompt と followUpPrompt に fixableCount の語が存在しない

- **Category**: manual
- **Priority**: should
- **Source**: tasks.md > T-04 AC

**GIVEN** `src/prompts/code-review-system.ts` と `src/core/step/code-review.ts` のソースコード  
**WHEN** `grep -n "fixableCount"` を実行する  
**THEN** 該当行が 0 件（混入があれば除去済み）

### TC-016: src/ の routing / 判定ロジックから fixableCount 読み取りが消えている

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-08 AC

**GIVEN** `src/` ディレクトリのソースコード  
**WHEN** `grep -rn "fixableCount" src/` を実行する  
**THEN** 許容ファイル（`src/core/port/report-result.ts` の型定義・parse 受け口、`src/core/step/report-tool.ts` の compat zod スキーマ・doc コメント）のみに限定され、`src/core/pipeline/types.ts` に `fixableCount` の読み取りが含まれない

---

## Result

```yaml
result: completed
total: 16
automated: 14
manual: 2
must: 11
should: 5
could: 0
blocked_reasons: []
```
