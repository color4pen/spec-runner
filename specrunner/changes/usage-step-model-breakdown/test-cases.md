# Test Cases: `specrunner usage` の step × model 内訳と USD コスト表示

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 28
- **Manual**: 2
- **Priority**: must: 22, should: 8, could: 0

---

### TC-001: job step の usage が step × model 行として出る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 引数なし `specrunner usage` が step × model 交差表を表示する > Scenario: job step の usage が step × model 行として出る

---

### TC-002: stepName を持たない invocation は command 名でバケットされる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 引数なし `specrunner usage` が step × model 交差表を表示する > Scenario: stepName を持たない invocation は command 名でバケットされる

---

### TC-003: slug 別集計が引き続き表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 既存の slug × model 集計を上位サマリとして維持する > Scenario: slug 別集計が引き続き表示される

---

### TC-004: 各集計行に cost 列が付く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 出力の各行に USD コストを表示する > Scenario: 各集計行に cost 列が付く

---

### TC-005: 4 種の token に対応する単価で合算する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: USD コストはモデル別料金テーブルで計算する > Scenario: 4 種の token に対応する単価で合算する

---

### TC-006: date suffix 付き key が解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: model key を正規化して料金テーブルへ解決する > Scenario: date suffix 付き key が解決される

---

### TC-007: 1M-context variant は別 key として扱われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: model key を正規化して料金テーブルへ解決する > Scenario: 1M-context variant は別 key として扱われる

---

### TC-008: 未登録 model が $? で表示され total から除外される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 料金未登録 model はコスト不明として明示する > Scenario: 未登録 model が $? で表示され total から除外される

---

### TC-009: 高コスト step が先頭に並ぶ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 集計出力が決定的に並ぶ > Scenario: 高コスト step が先頭に並ぶ

---

### TC-010: usage.json 不在 archive が skip される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 既存の互換挙動を保つ > Scenario: usage.json 不在 archive が skip される

---

### TC-011: 素の model key は normalizeModelKey で変換されない

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** `normalizeModelKey` に date suffix も context suffix も持たない `"claude-sonnet-4-6"` を渡す
**WHEN** 関数を呼ぶ
**THEN** `"claude-sonnet-4-6"` がそのまま返る

---

### TC-012: `-YYYYMMDD` を除去し `[1m]` は保持する（合成ケース）

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** `normalizeModelKey` に `"claude-opus-4-6[1m]-20251001"` を渡す（date suffix + context suffix の合成）
**WHEN** 関数を呼ぶ
**THEN** date suffix が除去され `[1m]` は保持された `"claude-opus-4-6[1m]"` が返る

---

### TC-013: `-` + 8 桁数字以外の suffix は除去しない

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** `normalizeModelKey` に `"claude-sonnet-4-6-draft"` のように 8 桁数字でない suffix を渡す
**WHEN** 関数を呼ぶ
**THEN** suffix は除去されず `"claude-sonnet-4-6-draft"` がそのまま返る

---

### TC-014: 登録済み model で computeCostUsd が非 null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `MODEL_PRICING` に登録済みの `"claude-sonnet-4-6"` と任意の正のトークン値を持つ `ModelUsage`
**WHEN** `computeCostUsd("claude-sonnet-4-6", usage)` を呼ぶ
**THEN** `null` ではなく数値が返る

---

### TC-015: token 数がすべて 0 のとき cost が 0 になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** 登録済み model と `inputTokens/outputTokens/cacheReadInputTokens/cacheCreationInputTokens` がすべて 0 の usage
**WHEN** `computeCostUsd` を呼ぶ
**THEN** `0` が返る

---

### TC-016: formatUsd(null) は "$?" を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `formatUsd` に `null` を渡す
**WHEN** 関数を呼ぶ
**THEN** `"$?"` が返る

---

### TC-017: formatUsd(数値) は小数第4位の "$x.xxxx" 形式で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `formatUsd(0.00123456)` を呼ぶ
**WHEN** 実行
**THEN** `"$0.0012"` が返る（`toFixed(4)` 相当）

---

### TC-018: formatUsd(0) は "$0.0000" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `formatUsd(0)` を呼ぶ
**WHEN** 実行
**THEN** `"$0.0000"` が返る

---

### TC-019: modelUsage が null の entry は aggregateUsage から除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / T-04

**GIVEN** `modelUsage: null` の invocation を含む `SlugUsage[]`
**WHEN** `aggregateUsage` を呼ぶ
**THEN** その invocation は `byStepModel` / `bySlug` / `grandTotal` のいずれにも計上されない

---

### TC-020: 複数 slug の bySlug 集計が正しく分離される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** slug `"alpha"` と `"beta"` をそれぞれ持つ `SlugUsage[]`
**WHEN** `aggregateUsage` を呼ぶ
**THEN** `bySlug["alpha"]` と `bySlug["beta"]` が独立して存在し token が互いに混入していない

---

### TC-021: 同一 step × model の token が複数 invocation で加算される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `stepName: "implementer"` で同一 model を持つ 2 件の invocation（各 inputTokens = 100）
**WHEN** `aggregateUsage` を呼ぶ
**THEN** `byStepModel["implementer"][model].inputTokens === 200`

---

### TC-022: renderUsageSummary の slug 行がアルファベット昇順に並ぶ

**Category**: unit
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** slug `"zebra"` と `"alpha"` を持つ aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** 出力の "By slug:" セクションで `alpha` が `zebra` より先に現れる

---

### TC-023: step 内の model がコスト降順に並ぶ

**Category**: unit
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-04

**GIVEN** 同一 step に高コスト model（A）と低コスト model（B）が混在する aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** model A の行が model B の行より前に出る

---

### TC-024: step の同点コスト時は step 名昇順に並ぶ

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** 合計コストが等しい step `"z-step"` と `"a-step"` が存在する aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** `"a-step"` が `"z-step"` より先に出る

---

### TC-025: skippedCount が 0 のとき skip 注記が出ない

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** `skippedCount = 0` で `renderUsageSummary` を呼ぶ
**WHEN** 実行
**THEN** 出力に `"skipped"` の文字列が含まれない

---

### TC-026: 未登録 model が 0 件のとき Total cost 行に除外注記が出ない

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03

**GIVEN** すべての model が料金テーブルに登録済みの aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** `"Total cost:"` 行に `"excludes"` が含まれない

---

### TC-027: ヘッダに archive entry 数が表示される

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** `entryCount = 3` の aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** 出力の先頭行に `"3 archive entries"` が含まれる

---

### TC-028: grand total 行に全 model の token 合計が表示される

**Category**: unit
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** 複数 model をまたぐ aggregation
**WHEN** `renderUsageSummary` を呼ぶ
**THEN** "Grand Total:" セクションに各 model の in/out/cacheRead/cacheCreate の合計が含まれる

---

### TC-029: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 変更後のソースツリー
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラー 0 件で終了する

---

### TC-030: bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 変更後のソースツリー
**WHEN** `bun run test` を実行する
**THEN** テストスイートがすべて pass する

---

## Result

```yaml
result: completed
total: 30
automated: 28
manual: 2
must: 22
should: 8
could: 0
blocked_reasons: []
```
