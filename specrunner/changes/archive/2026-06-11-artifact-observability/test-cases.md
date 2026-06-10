# Test Cases: 成果物の lineage と工程ごとの cost 帰属の可視化（記述子化 R5）

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 13, should: 7, could: 0

---

### TC-001: 標準 step 完了で lineage record が追記される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 成果物の lineage を step 完了時に journal へ記録する > Scenario: 標準 step 完了で lineage record が追記される

---

### TC-002: content hash が取得できない artifact は null で記録される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 成果物の lineage を step 完了時に journal へ記録する > Scenario: content hash が取得できない artifact は null で記録される

---

### TC-003: lineage 記録の失敗は step 完了を妨げない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 成果物の lineage を step 完了時に journal へ記録する > Scenario: lineage 記録の失敗は step 完了を妨げない

---

### TC-004: 標準 pipeline の挙動が lineage 導入後も不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: lineage 記録は観測専用で実行に影響しない > Scenario: 標準 pipeline の挙動が lineage 導入後も不変

---

### TC-005: lineage と cost を持つ job の表示

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `job show` で lineage と step 別 cost を表示する > Scenario: lineage と cost を持つ job の表示

---

### TC-006: lineage を持たない旧 job の表示

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `job show` で lineage と step 別 cost を表示する > Scenario: lineage を持たない旧 job の表示

---

### TC-007: 非標準工程名の記録が読める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 任意工程名を含む記録を読める > Scenario: 非標準工程名の記録が読める

---

### TC-008: 標準記述子の検証は whitelist を維持

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 任意工程名を含む記録を読める > Scenario: 標準記述子の検証は whitelist を維持

---

### TC-009: 旧 version の archive サンプルが移行で読める

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 旧 version の state を読み込み時に移行する > Scenario: 旧 version の archive サンプルが移行で読める

---

### TC-010: 新規 job は新 version で書かれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧 version の state を読み込み時に移行する > Scenario: 新規 job は新 version で書かれる

---

### TC-011: fold() が LineageRecord を FoldResult.lineage に集約する

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-03

**GIVEN** `events.jsonl` に `type: "lineage"` の record が 1 件追記されている  
**WHEN** `fold()` を実行する  
**THEN** `FoldResult.lineage` に当該 record が含まれ、`state.json`（NormalizedJobState）に lineage フィールドは追加されない

---

### TC-012: lineage 追記後も state.json に lineage フィールドが増えない

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-03

**GIVEN** lineage record を `appendLineage` で journal に追記した job  
**WHEN** `state.json` の内容を読み込む  
**THEN** `state.json` に `lineage` キーは存在せず、追記前と同一の projection が保持される

---

### TC-013: "history" type を含む旧 events.jsonl が fold() で例外なく読める

**Category**: unit
**Priority**: should
**Source**: design.md > D2 Risk / tasks.md > T-03

**GIVEN** `{"type":"history",...}` の record を含む旧 `events.jsonl`（lineage record は不在）  
**WHEN** `fold()` を実行する  
**THEN** 例外を投げずに完了し、`FoldResult.lineage` は空配列、history 相当の遷移データは従来どおり保持される

---

### TC-014: LocalRuntime.digestArtifacts が同一ファイルに対し安定した sha256 を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** LocalRuntime と、内容が固定されたファイルを参照する `refs`  
**WHEN** `digestArtifacts` を 2 回呼び出す  
**THEN** 両呼び出しで同一の `"sha256:<hex>"` 形式の hash が返され、例外を投げない

---

### TC-015: ManagedRuntime.digestArtifacts が hash:null を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** ManagedRuntime と任意の `refs`  
**WHEN** `digestArtifacts` を呼び出す  
**THEN** 各 ref の `hash` が `null` で返され、`path` は保持され、例外を投げない

---

### TC-016: ファイル不在時に digestArtifacts が hash:null を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** LocalRuntime と、対応するファイルが存在しない path を持つ `refs`  
**WHEN** `digestArtifacts` を呼び出す  
**THEN** 当該 ref の `hash` が `null` で返され、例外を投げない

---

### TC-017: writes() を宣言していない step では lineage record が記録されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `writes()` を宣言していない step が正常完了する  
**WHEN** `finalizeStep` が実行される  
**THEN** `events.jsonl` に `type: "lineage"` の record は追記されない

---

### TC-018: specrunner usage 等の他コマンド出力が不変

**Category**: integration
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-06 / T-07

**GIVEN** lineage 機能を有効にした上で動作する archive  
**WHEN** `specrunner usage <slug>` / `specrunner usage` / `job ps` を実行する  
**THEN** 各コマンドの出力が lineage 導入前と byte 単位で同一であり、lineage / cost セクションは表示されない

---

### TC-019: validateJobState が version 2 以外の未知 version を reject する

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `version: 3`（または 0 / undefined）を持つ `state.json`  
**WHEN** `validateJobState` を呼び出す  
**THEN** バリデーションエラーが返され、state は受理されない

---

### TC-020: usage.json から step 別 cost を集計して token + USD を算出する

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-06

**GIVEN** 同一 step 名を持つ複数の `CommandInvocation` を含む `usage.json`  
**WHEN** step 別 cost 集計ロジックを実行する  
**THEN** 同一 step の token が合算され、`pricing.ts` の `computeCostUsd` / `formatUsd` を通じた USD 値が併記される

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 13
should: 7
could: 0
blocked_reasons: []
```
