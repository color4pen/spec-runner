# Test Cases: test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 13, should: 2, could: 1

---

### TC-001: missing と assertionless の双方を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage violation は欠落 TC-ID を missing / assertionless に区別して保持する > Scenario: missing と assertionless の双方を保持する

---

### TC-002: halt メッセージに欠落 TC-ID が載る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt メッセージは test-coverage violation の欠落 TC-ID を列挙する > Scenario: halt メッセージに欠落 TC-ID が載る

---

### TC-003: missing と assertionless で異なる修復指示を ID 明示で出す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: follow-up prompt は test-coverage violation から ID 明示の修復指示を生成する > Scenario: missing と assertionless で異なる修復指示を ID 明示で出す

---

### TC-004: 違反 → 修復 → 再検証 pass の経路が成立する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の test-coverage 契約は follow-up policy で同一 session 修復する > Scenario: 違反 → 修復 → 再検証 pass の経路が成立する

---

### TC-005: 修復試行上限まで解消しない違反は halt へ合流し ID を伴う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の test-coverage 契約は follow-up policy で同一 session 修復する > Scenario: 修復試行上限まで解消しない違反は halt へ合流し ID を伴う

---

### TC-006: missing のみのケースで coverage.missingTcIds が評価器の結果と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `evaluateTestCoverage` が `missingTcIds = ["TC-001"]`、`assertionlessTcIds = []` を返す
**WHEN** local runtime の `validateStepOutputs` が `test-coverage` 契約を検証し違反を生成する
**THEN** `violation.coverage.missingTcIds` が `["TC-001"]` であり、`violation.coverage.assertionlessTcIds` が `[]` であり、`violation.detail` が `["TC-001"]` を含む

---

### TC-007: assertionless のみのケースで coverage.assertionlessTcIds が評価器の結果と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `evaluateTestCoverage` が `missingTcIds = []`、`assertionlessTcIds = ["TC-002"]` を返す
**WHEN** local runtime の `validateStepOutputs` が `test-coverage` 契約を検証し違反を生成する
**THEN** `violation.coverage.assertionlessTcIds` が `["TC-002"]` であり、`violation.coverage.missingTcIds` が `[]` であり、`violation.detail` が `["TC-002"]` を含む

---

### TC-008: missing と assertionless 混在ケースで detail は union・coverage は区別を維持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `evaluateTestCoverage` が `missingTcIds = ["TC-001"]`、`assertionlessTcIds = ["TC-002"]` を返す
**WHEN** local runtime の `validateStepOutputs` が `test-coverage` 契約を検証し違反を生成する
**THEN** `violation.coverage.missingTcIds` が `["TC-001"]` であり、`violation.coverage.assertionlessTcIds` が `["TC-002"]` であり、`violation.detail` が両集合の union（`["TC-001", "TC-002"]` を含む）を維持する

---

### TC-009: coverage 未設定の test-coverage violation で halt が "see file" fall back になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `coverage` フィールドが `undefined` の `test-coverage` violation（`path = "specrunner/changes/foo/test-cases.md"`）
**WHEN** `makeOutputGateHalt` を呼ぶ
**THEN** 生成される `error.message` / `error.hint` は `coverage` 由来の TC-ID 列挙を含まず、path のみを描画する（"see file" fall back）

---

### TC-010: test-materialize の test-coverage 契約が follow-up policy を宣言する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `TestMaterializeStep` インスタンスと適切な `state` / `deps`
**WHEN** `outputContracts(state, deps)` を呼ぶ
**THEN** 返すコントラクト一覧の中の `test-coverage` 契約の `policy` が `"follow-up"` である

---

### TC-011: step-context-builder が test-materialize の follow-up 契約から outputVerification を構築する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** test-materialize の `test-coverage` 契約が `policy: "follow-up"` で宣言されている
**WHEN** `buildStepContext` を通じてステップコンテキストを構築する
**THEN** `ctx.policy.outputVerification` が定義され、`buildPrompt(violations, 1)` に `test-coverage` violation（missing TC-ID あり）を渡すと欠落 TC-ID を含む修復指示を返す

---

### TC-012: managed runtime の test-coverage 分岐が best-effort skip のまま

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** managed runtime（`src/core/runtime/managed.ts`）が `test-coverage` 契約を含む出力検証を実行する
**WHEN** `validateStepOutputs` を呼ぶ
**THEN** `test-coverage` に対して violation を返さない（best-effort skip のまま）。managed.ts の `test-coverage` 分岐に変更なし

---

### TC-013: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** T-01〜T-06 の全実装が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、全テストが pass する。TC-TMB-04 の期待値（`"halt"` → `"follow-up"`）更新以外の既存テストは無改変で green

---

### TC-014: test-coverage violation の両カテゴリ空で follow-up prompt が fall back を出す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (設計 D3: 両カテゴリとも空の fall back)

**GIVEN** `test-coverage` violation の `coverage.missingTcIds = []`、`coverage.assertionlessTcIds = []`（`path = "specrunner/changes/foo/test-cases.md"`）
**WHEN** `buildOutputFollowUpPrompt` を呼ぶ
**THEN** prompt は `(see specrunner/changes/foo/test-cases.md for uncovered must TCs)` に相当する fall back 行を含み、TC-ID の箇条書きを出さない

---

### TC-015: halt メッセージで missing のみの場合 assertionless 節が省かれる

**Category**: unit
**Priority**: should
**Source**: design.md > D2 ("; " 連結と非空条件)

**GIVEN** `test-coverage` violation が `coverage.missingTcIds = ["TC-010"]`、`coverage.assertionlessTcIds = []` を保持する
**WHEN** `makeOutputGateHalt` を呼ぶ
**THEN** `error.message` / `error.hint` は `TC-010` を含む missing 節を描画し、assertionless 節（"assertionless TCs:"）を含まない

---

### TC-016: follow-up prompt で assertionless のみの場合 missing 修復指示が省かれる

**Category**: unit
**Priority**: could
**Source**: design.md > D3 (カテゴリ別サブ節)

**GIVEN** `test-coverage` violation が `coverage.missingTcIds = []`、`coverage.assertionlessTcIds = ["TC-020"]` を保持する
**WHEN** `buildOutputFollowUpPrompt` を呼ぶ
**THEN** prompt は `TC-020` に対する「assertion を追加する」指示を含み、「テストを書き TC-ID を記載する」指示（missing 向け）を含まない

---

## Result

```yaml
result: partial
total: 16
automated: 15
manual: 1
must: 13
should: 2
could: 1
blocked_reasons: []
```
