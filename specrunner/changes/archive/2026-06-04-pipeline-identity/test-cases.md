# Test Cases: JobState に pipeline 同一性（pipelineId）を記録する

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 13
- **Manual**: 1
- **Priority**: must: 11, should: 3, could: 0

---

### TC-001: pipelineId を持つ state を round-trip しても値が保たれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: JobState は pipeline 同一性を optional フィールドとして保持する > Scenario: pipelineId を持つ state を round-trip しても値が保たれる

---

### TC-002: pipelineId を持たない legacy state が有効として読める

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: JobState は pipeline 同一性を optional フィールドとして保持する > Scenario: pipelineId を持たない state も有効として読める

---

### TC-003: 新規ジョブの state に pipelineId が記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 新規ジョブ起動時に現行 pipeline 識別子を記録する > Scenario: 新規ジョブの state に pipelineId が記録される

---

### TC-004: pipeline を組み立てる command が識別子を明示的に渡す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 新規ジョブ起動時に現行 pipeline 識別子を記録する > Scenario: pipeline を組み立てる command が識別子を明示的に渡す

---

### TC-005: pipelineId 欠落時に getPipelineId が "standard" を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipelineId 欠落時の解決値は "standard" に一意化される > Scenario: pipelineId を持たない state は "standard" に解決される

---

### TC-006: pipelineId 記録済み state で getPipelineId がその値を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipelineId 欠落時の解決値は "standard" に一意化される > Scenario: pipelineId を持つ state はその値に解決される

---

### TC-007: 画面出力スナップショットが不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: pipelineId の導入は実行・再開・画面出力の挙動を変えない > Scenario: 画面出力スナップショットが不変

---

### TC-008: pipelineId を持たない legacy state からの再開が従来通り動作する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: pipelineId の導入は実行・再開・画面出力の挙動を変えない > Scenario: pipelineId を持たない state からの再開が従来通り動作する

---

### TC-009: STANDARD_PIPELINE_ID の値と import 可能性

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/kernel/pipeline-ids.ts` が作成済みで `STANDARD_PIPELINE_ID` を export している
**WHEN** 任意のモジュールから `STANDARD_PIPELINE_ID` を import する
**THEN** 値が `"standard"` である

---

### TC-010: kernel 定数モジュールが循環依存なく import できる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/kernel/pipeline-ids.ts` が作成済み
**WHEN** `bun run typecheck` を実行する
**THEN** `src/state/` / `src/store/` / `src/core/pipeline/` からの import で循環依存エラーが発生しない

---

### TC-011: validateJobState が pipelineId 欠落をそのまま保つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `pipelineId` フィールドを含まない state オブジェクト
**WHEN** `validateJobState` を通過させる
**THEN** 返却された state の `pipelineId` は `undefined` のまま（`"standard"` が書き込まれていない）

---

### TC-012: JobStateStore.create が pipelineId 未指定でも "standard" を持つ state を生成する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `JobStateStore.create` の params に `pipelineId` を指定しない
**WHEN** `create` を呼び出す
**THEN** 生成された初期 state の `pipelineId` が `"standard"` である

---

### TC-013: getPipelineId が I/O 依存を持たない純粋関数である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `getPipelineId` 関数
**WHEN** state オブジェクトを引数として渡す
**THEN** filesystem / DB などの副作用なしに同期で値を返す

---

### TC-014: 全新規 state への pipelineId 追加による state スナップショット期待値の更新確認

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** 既存の state スナップショットテストが存在する
**WHEN** `pipelineId` フィールドが全新規 state に追加された状態でテストを実行する
**THEN** スナップショット期待値の更新要否を確認し、必要であれば更新して全テストが green になる

---

## Result

```yaml
result: completed
total: 14
automated: 13
manual: 1
must: 11
should: 3
could: 0
blocked_reasons: []
```
