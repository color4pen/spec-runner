# Test Cases: changed-line-coverage の type-only ファイル not-loaded 誤検出解消

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```
-->

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 17
- **Manual**: 1
- **Priority**: must: 15, should: 3, could: 0

---

## isTypeOnlySource 判定関数（T-01）

### TC-001: 型のみの構文は true

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う > Scenario: 型のみの構文は true

---

### TC-002: runtime 構文を 1 つでも含むと false

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う > Scenario: runtime 構文を 1 つでも含むと false

---

### TC-003: 型宣言と式文が混在すると false（偽陽性の排除）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う > Scenario: 型宣言と式文が混在すると false（偽陽性の排除）

---

### TC-009: 空ファイル・空白のみ・コメントのみは true

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / T-04

**GIVEN** ソースが (a) 空文字列、(b) 空白文字のみ（スペース・タブ・改行）、(c) 行コメント `//` のみ、(d) ブロックコメント `/* */` のみ、(e) JSDoc `/** */` のみ、のいずれか
**WHEN** `isTypeOnlySource` を適用する
**THEN** true を返す

---

## evaluateChangedLineCoverage 評価器（T-02）

### TC-004: lcov に無い type-only ファイルの変更は gate を fail させない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lcov に SF が無い type-only ファイルは fail させず理由付きで skip する > Scenario: lcov に無い type-only ファイルの変更は gate を fail させない

---

### TC-005: lcov に無い runtime ファイルの変更は fail する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lcov に SF が無い runtime ファイルは従来どおり fail する > Scenario: lcov に無い runtime ファイルの変更は fail する

---

### TC-007: DA レコードが無い変更行は従来どおり pass（判定 3 不変）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の changed-line-coverage 挙動は不変 > Scenario: DA レコードが無い変更行は従来どおり pass（判定 3 不変）

---

### TC-008: exclude 宣言ファイルは type-only 判定に関わらず対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の changed-line-coverage 挙動は不変 > Scenario: exclude 宣言ファイルは type-only 判定に関わらず対象外

---

### TC-010: typeOnlyFiles 省略時は not-loaded fail-closed が完全に不変

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-02 Acceptance Criteria

**GIVEN** lcov に存在しない変更ファイルがある状態で `evaluateChangedLineCoverage` を `typeOnlyFiles` 省略（optional フィールドなし）で呼び出す
**WHEN** 評価器を実行する
**THEN** 従来どおり `failedFiles` に `reason: "not-loaded"` で記録され、`status` は `failed` になる（additive change が既存挙動を変えないことの確認）

---

### TC-011: typeOnlySkipped フィールドが全結果経路で含まれる（undefined でない）

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** `evaluateChangedLineCoverage` を `typeOnlyFiles` 省略または空 `Set` で呼び出す（passed / failed いずれのケース）
**WHEN** 評価器を実行して `EvaluateResult` を取得する
**THEN** `result.typeOnlySkipped` は空配列 `[]` として存在し、`undefined` でない

---

### TC-012: typeOnlySkipped が非空のとき stdout に専用行が追記される

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** `typeOnlyFiles` に type-only ファイル（例: `src/types.ts`）を含め、そのファイルが lcov に不在の変更ファイルとして存在する
**WHEN** `evaluateChangedLineCoverage` を実行し `EvaluateResult` を取得する
**THEN** `result.stdout` に `"Type-only"` を含む専用行が追記され、既存の passed サマリ行・`"Skipped (not in coverage surface)"` 行の文言は変化しない

---

## orchestrator runChangedLineCoverageGate（T-03）

### TC-013: lcov 不在 + type-only ソース → gate passed・stdout に skip 可視化（#884 再現解消）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト

**GIVEN** 一時ディレクトリに `interface` + JSDoc または複数行 `export type` union のみで構成された type-only ソース（#884 実例の再現）を書いた変更ファイルがあり、生成した lcov にそのファイルの SF レコードが存在しない
**WHEN** `runChangedLineCoverageGate` を実行する
**THEN** `PhaseResult.status` は `passed` で、stdout に type-only skip の記録が含まれ、`failedFiles` に当該ファイルが含まれない

---

### TC-014: lcov 不在 + runtime ソース → gate failed（TC-CLG-04 相当不変）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト

**GIVEN** 一時ディレクトリに関数宣言等の runtime コードを含むソースを書いた変更ファイルがあり、lcov にその SF レコードが存在しない
**WHEN** `runChangedLineCoverageGate` を実行する
**THEN** `PhaseResult.status` は `failed` で、当該ファイルが `not-loaded` として記録される

---

### TC-006: ソースが読めないと fail する（fail-closed）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: ソース読取り失敗は fail-closed > Scenario: ソースが読めないと fail する

---

### TC-015: lcov 不在 + ソースファイル不在 → gate failed（fail-closed・orchestrator 層）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト

**GIVEN** 変更ファイルとして記録されているが disk 上にソースファイルが存在しない（読取り例外）ファイルがあり、lcov にも SF レコードが無い
**WHEN** `runChangedLineCoverageGate` を実行する
**THEN** `PhaseResult.status` は `failed` で、当該ファイルが not-loaded として記録される（type-only skip にならない）

---

## 挙動保存・回帰確認（T-04）

### TC-017: 既存 changed-line-coverage テストが無改変で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / request.md > R3

**GIVEN** `tests/unit/core/verification/changed-line-coverage.test.ts` の既存テスト（TC-CLG-01〜TC-CLG-09 / GATE-01〜GATE-06 ほか）が一切変更されていない
**WHEN** `bun run test tests/unit/core/verification/changed-line-coverage.test.ts` を実行する
**THEN** 全テストが green（新規追加テストは別ファイルに分離されており、既存ファイルに編集が入っていない）

---

### TC-018: typecheck が green（型整合性の確認）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01/T-02/T-03/T-04 Acceptance Criteria

**GIVEN** T-01（`type-only.ts`）/ T-02（評価器拡張）/ T-03（orchestrator 配線）の実装が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなし・TypeScript コンパイルが通る

---

### TC-016: 破壊確認 — type-only skip 分岐を戻すと対応テストが fail する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04（破壊確認記録）/ request.md > 受け入れ基準

**GIVEN** `evaluateChangedLineCoverage` の type-only skip 分岐を除去し、lcov 不在を一律 `not-loaded` fail させる修正前の挙動に戻す
**WHEN** TC-004 / TC-013 相当のテスト（lcov 不在 type-only ファイルが skip されることを検証するテスト）を実行する
**THEN** そのテストが fail する（新テストが type-only skip 分岐に真に依存しており、回帰防止歯として機能していることをテストコメントまたは完了メモに記録する）

---

## Result

```yaml
result: completed
total: 18
automated: 17
manual: 1
must: 15
should: 3
could: 0
blocked_reasons: []
```
