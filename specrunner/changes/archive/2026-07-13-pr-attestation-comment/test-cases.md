# Test Cases: PR ごとの attestation をコメント添付する

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 12, should: 6, could: 0

---

### TC-001: 代表 journal + usage から機械可読サマリを生成する

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: attestation 組立は副作用なし純関数でなければならない > Scenario: 代表的な journal + usage から機械可読サマリを生成する

---

### TC-002: 同一入力に対し同一の journalHash を返す

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: attestation 組立は副作用なし純関数でなければならない > Scenario: 同一入力に対し同一の hash を返す

---

### TC-003: 複数 step が startedAt 昇順に並ぶ

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: ゲート実行順と各ゲートの verdict を journal から導かなければならない > Scenario: 複数 step が実行時刻順に並ぶ

---

### TC-004: critical/high と fixable/decision-needed の件数が集計される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: verdict 導出入力の findings を要約しなければならない > Scenario: critical/high と fixable/decision-needed の件数が集計される

---

### TC-005: 既知 model のコストが算出される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: step 別 model と予算/コスト消費を usage.json から導かなければならない > Scenario: 既知 model のコストが算出される

---

### TC-006: 未知 model は null コストと unpricedModels に反映される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: step 別 model と予算/コスト消費を usage.json から導かなければならない > Scenario: 未知 model は null コストと unpricedModels に反映される

---

### TC-007: PR 作成成功時にコメントが添付される

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: pr-create は PR 作成成功後に attestation コメントを添付しなければならない > Scenario: PR 作成成功時にコメントが添付される

---

### TC-008: createIssueComment が失敗しても PR 作成は成功のまま

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: コメント添付の失敗は pr-create を失敗させてはならない（best-effort）> Scenario: createIssueComment が失敗しても PR 作成は成功のまま

---

### TC-009: journal が存在しない場合はコメントを添付せず成功する

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: コメント添付の失敗は pr-create を失敗させてはならない（best-effort）> Scenario: journal が存在しない場合はコメントを添付せず成功する

---

### TC-010: journalHash が journalContent の sha256 hex と独立再計算で一致する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-05 / design.md D3

**GIVEN** 任意の `journalContent` 文字列と空の `usage`

**WHEN** `buildAttestation({ journalContent, usage })` を呼んだ後、`node:crypto` の `createHash("sha256").update(journalContent).digest("hex")` を呼び出し側で独立計算する

**THEN** `attestation.journalHash` と独立計算値が完全に一致する

---

### TC-011: findings を持たない gate には findings フィールドが付かない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md T-05 / design.md D4

**GIVEN** `outcome.toolResult.findings` が存在しない step-attempt（design / implementer 系）を含む events.jsonl

**WHEN** `buildAttestation` を呼ぶ

**THEN** 該当 gate の `findings` プロパティが `undefined`（フィールド自体が付加されない）

---

### TC-012: findings 要約に finding 本文（title/rationale 等）が含まれない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-05 / spec.md > Requirement: verdict 導出入力の findings を要約しなければならない

**GIVEN** `outcome.toolResult.findings` に `title`・`rationale` フィールドを持つ Finding を含む step-attempt

**WHEN** `buildAttestation` を呼ぶ

**THEN** 返り値の該当 gate の `findings` は `total`・`bySeverity`・`byResolution` のみを持ち、`title`・`rationale` 等の finding 本文フィールドを含まない

---

### TC-013: modelUsage === null の invocation は model 空・cost null になる

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-05 / design.md D5

**GIVEN** あるステップの invocation が `modelUsage: null`（managed runtime 相当）

**WHEN** `buildAttestation` を呼ぶ

**THEN** そのステップの `stepModels` entry の `models` が空配列であり、`cost.perStep` の該当 step の `costUsd` が `null` になる

---

### TC-014: stepName を持たない invocation は step 別集計から除外される

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md T-02 / design.md D5

**GIVEN** `stepName` フィールドを持たない invocation が usage.json に含まれる

**WHEN** `buildAttestation` を呼ぶ

**THEN** その invocation は `stepModels` / `cost.perStep` に現れない

---

### TC-015: JSON フェンスブロックを JSON.parse すると元の attestation と一致する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-06 / design.md D8

**GIVEN** 任意の `Attestation` object

**WHEN** `renderAttestationComment(attestation)` を呼び、返り値の ` ```json ` フェンスブロック内容を `JSON.parse` する

**THEN** parse 結果が元の `attestation` と deep equal になる

---

### TC-016: 人間可読サマリに journal hash とゲート数が現れる

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-06 / design.md D8

**GIVEN** `journalHash` と 3 つの `gates` を持つ `Attestation`

**WHEN** `renderAttestationComment(attestation)` を呼ぶ

**THEN** 返り値の文字列に `journalHash` の値が含まれ、ゲート数に関する情報が人間可読部に現れる

---

### TC-017: existing-open の場合も createIssueComment が呼ばれる

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md T-04 / design.md D7

**GIVEN** `runPrCreate` が `{ status: "existing-open", number: 99, url: "..." }` を返し、change folder に events.jsonl と usage.json が存在する

**WHEN** pr-create step の `run` が実行される

**THEN** `createIssueComment` が PR 番号 99 に対して 1 回呼ばれ、body が attestation の `json` フェンスを含む

---

### TC-018: 既存 pr-create テスト（TC-008〜020）が回帰しない

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md T-07

**GIVEN** attestation 添付ロジックが pr-create.ts に追加された状態

**WHEN** `bun test tests/unit/step/pr-create.test.ts` を実行する

**THEN** 既存テストケース TC-008〜020 が全て green のまま（回帰なし）

---

## Result

```yaml
result: completed
total: 18
automated: 18
manual: 0
must: 12
should: 6
could: 0
blocked_reasons: []
```
