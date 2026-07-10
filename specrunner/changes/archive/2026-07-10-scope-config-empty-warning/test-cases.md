# Test Cases: permissionScope 宣言 pipeline で forbidden 空のとき run 準備で warning を出す

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 9, should: 4, could: 0

---

### TC-001: fast + forbidden 未設定の run 準備で warning が出る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: scope 宣言 + 解決後 forbidden 空で run 準備時に warning を 1 回出す > Scenario: fast（scope 宣言）+ forbidden 未設定の run 準備で warning が出る

---

### TC-002: 判定は解決後 descriptor の presence + 空で決まる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 判定は pipeline id に依存しない一般形 > Scenario: 判定は解決後 descriptor の presence + 空で決まる

---

### TC-003: standard の run 準備で warning が出ない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: permissionScope を宣言しない pipeline では warning を出さない > Scenario: standard の run 準備で warning が出ない

---

### TC-004: fast + forbidden 設定済みで warning が出ない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: forbidden が 1 件以上解決される場合は warning を出さない > Scenario: fast + forbidden 設定済みで warning が出ない

---

### TC-005: 1 run で warning が 1 回

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 1 run 内で warning は重複しない > Scenario: 1 run で warning が 1 回

---

### TC-006: 判定 pure 関数は自身ではログを出さない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 1 run 内で warning は重複しない > Scenario: 判定 pure 関数は自身ではログを出さない

---

### TC-007: permissionScope なし → 参照同一で返る（既存契約維持）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: applyScopeConfig の pure 変換契約は不変 > Scenario: permissionScope なし → 参照同一で返る（既存契約維持）

---

### TC-008: 警告文言に pipeline id と forbiddenSurfaces config キーが含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `scopeConfigEmptyWarning` に `permissionScope` あり・`forbidden` 空の descriptor（id="fast"）を渡す
**WHEN** 返り値の string を検査する
**THEN** 文字列に `"fast"` と `"pipeline.fast.forbiddenSurfaces"` が含まれ、scope breach 検出が実質無効である旨の語が含まれる

---

### TC-009: scopeConfigWarningForJob が fast + 空 config で非 null を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `pipelineId="fast"` の jobState と `forbiddenSurfaces` が未設定（キー欠落）の config
**WHEN** `scopeConfigWarningForJob(jobState, config)` を呼ぶ
**THEN** 非 null の warning 文言が返る（`applyScopeConfig` 適用後の解決済み descriptor に対して判定されていることを間接確認）

---

### TC-010: setupWorkspace 失敗では warning が出ない

**Category**: integration
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02 Acceptance Criteria

**GIVEN** fast + forbidden 未設定 config の job で、`setupWorkspace` が失敗して early-return となる状態
**WHEN** `CommandRunner.execute()` を実行する
**THEN** scope に関する warning は 1 件も出力されない

---

### TC-011: resume 経路でも warning が 1 回出る

**Category**: integration
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** fast + forbidden 未設定 config の job に対して `ResumeCommand` が `CommandRunner.execute()` を通る状態
**WHEN** `execute()` を実行する
**THEN** scope warning が stderr にちょうど 1 回出力される

---

### TC-012: 任意 id の permissionScope 宣言 descriptor で判定が動作する（id 分岐なし）

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** id が `"custom-pipeline"` で `permissionScope` あり・`forbidden` 空の任意 descriptor fixture
**WHEN** `scopeConfigEmptyWarning(descriptor)` を呼ぶ
**THEN** 非 null の文言が返り、文言に `"custom-pipeline"` と `"pipeline.custom-pipeline.forbiddenSurfaces"` が含まれる（`fast` 固有の分岐なく一般形で動作することを確認）

---

### TC-013: typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** 本変更の実装完了状態（`scope-warning.ts` 追加・`runner.ts` 配線・テスト追加）
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、既存テスト（`resolve-scope.test.ts`・`runner.test.ts` 既存ケース・`pipeline-run-gate.test.ts`）を含む全テストが green で終了する

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 9
should: 4
could: 0
blocked_reasons: []
```
