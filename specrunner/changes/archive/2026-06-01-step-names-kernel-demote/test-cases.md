# Test Cases: step-names-kernel-demote

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 17, should: 3, could: 0

---

### TC-001: kernel/step-names.ts が 3 定数を export する

**Category**: unit
**Priority**: must
**Source**: T-01 受け入れ基準

**GIVEN** src/kernel/step-names.ts が新規作成されている  
**WHEN** ファイルの export を確認する  
**THEN** `STEP_NAMES`, `AGENT_STEP_NAMES`, `CLI_STEP_NAMES` がすべて export されている  
AND 各定数の値（キー・文字列値）が変更前の `src/core/step/step-names.ts` と完全に一致する

---

### TC-002: STEP_NAMES の全 13 エントリが保持される

**Category**: unit
**Priority**: must
**Source**: T-01 / 要件 2（型安全）

**GIVEN** src/kernel/step-names.ts が作成されている  
**WHEN** `STEP_NAMES` オブジェクトのキーを列挙する  
**THEN** `DESIGN`, `SPEC_REVIEW`, `SPEC_FIXER`, `DELTA_SPEC_VALIDATION`, `DELTA_SPEC_FIXER`, `TEST_CASE_GEN`, `IMPLEMENTER`, `VERIFICATION`, `BUILD_FIXER`, `CODE_REVIEW`, `CODE_FIXER`, `ADR_GEN`, `PR_CREATE` の全 13 キーが存在する  
AND それぞれの文字列値が移動前と一致する

---

### TC-003: core/step/step-names.ts が re-export barrel になっている

**Category**: unit
**Priority**: must
**Source**: T-01 / design D2

**GIVEN** src/core/step/step-names.ts が変換されている  
**WHEN** ファイルの内容を確認する  
**THEN** `export * from "../../kernel/step-names.js"` の行が存在する  
AND 定数の直接定義（`STEP_NAMES = {`, `AGENT_STEP_NAMES = [` 等）が残っていない

---

### TC-004: config/migrate.ts の import が kernel を向いている

**Category**: unit
**Priority**: must
**Source**: T-02 受け入れ基準 / design D3

**GIVEN** src/config/migrate.ts が変更されている  
**WHEN** ファイルの import 行を確認する  
**THEN** `../core/step/step-names.js` への import が存在しない  
AND `../kernel/step-names.js` から `STEP_NAMES` を import している

---

### TC-005: state/schema.ts の import が kernel を向いている

**Category**: unit
**Priority**: must
**Source**: T-02 受け入れ基準 / design D3

**GIVEN** src/state/schema.ts が変更されている  
**WHEN** ファイルの import 行を確認する  
**THEN** `../core/step/step-names.js` への import が存在しない  
AND `../kernel/step-names.js` から `AGENT_STEP_NAMES`, `CLI_STEP_NAMES`, `STEP_NAMES` を import している

---

### TC-006: src/config/ 配下に core/step import が存在しない

**Category**: unit
**Priority**: must
**Source**: 受け入れ基準（grep 検証）

**GIVEN** src/config/ 配下の全ファイルが変更後の状態にある  
**WHEN** `grep -r "core/step" src/config/` を実行する  
**THEN** 出力が空（マッチ 0 件）である

---

### TC-007: src/state/ 配下に core/step/step-names import が存在しない

**Category**: unit
**Priority**: must
**Source**: 受け入れ基準（grep 検証）

**GIVEN** src/state/ 配下の全ファイルが変更後の状態にある  
**WHEN** `grep -r "core/step/step-names" src/state/` を実行する  
**THEN** 出力が空（マッチ 0 件）である

---

### TC-008: arch-allowlist.ts の R3 エントリが削除されている

**Category**: unit
**Priority**: must
**Source**: T-03 受け入れ基準

**GIVEN** tests/unit/architecture/arch-allowlist.ts が変更されている  
**WHEN** `ARCH_ALLOWLIST` 配列の `tracking` フィールドを確認する  
**THEN** `tracking: "R3"` のエントリが 0 件である  
AND `config/migrate.ts` に言及する R3 エントリが存在しない  
AND `state/schema.ts` に言及する R3 エントリが存在しない（step-names 由来のもの）

---

### TC-009: arch-allowlist.ts の他エントリが全件保持されている

**Category**: unit
**Priority**: must
**Source**: T-03 / スコープ外

**GIVEN** tests/unit/architecture/arch-allowlist.ts が変更されている  
**WHEN** `ARCH_ALLOWLIST` 配列の内容を確認する  
**THEN** `tracking: "R1"` のエントリ（parser/ → core/）が全 10 件残っている  
AND `tracking: "B3-state-port"` のエントリが残っている  
AND `tracking: "B3-state-helpers"` のエントリが残っている  
AND `tracking: "B3-logger"` のエントリが残っている  
AND `tracking: "R4"` のエントリ（util/ → src/）が全件残っている  
AND B-6, B-8 関連エントリが全件残っている

---

### TC-010: StepName 系の型が正しく導出される

**Category**: integration
**Priority**: must
**Source**: 要件 2 / T-02 受け入れ基準

**GIVEN** state/schema.ts が `../kernel/step-names.js` から import するよう変更されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `StepName` が `typeof STEP_NAMES[keyof typeof STEP_NAMES]` として正しく導出される  
AND `AgentStepName` が `(typeof AGENT_STEP_NAMES)[number]` として正しく導出される  
AND `CliStepName` が `(typeof CLI_STEP_NAMES)[number]` として正しく導出される  
AND typecheck が exit code 0 で完了する

---

### TC-011: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: T-01 / T-02 受け入れ基準

**GIVEN** 全ての変更（T-01 〜 T-03）が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0 である  
AND TypeScript エラーが 0 件である

---

### TC-012: bun run build が green

**Category**: integration
**Priority**: must
**Source**: T-04 受け入れ基準

**GIVEN** 全ての変更が適用されている  
**WHEN** `bun run build` を実行する  
**THEN** exit code が 0 である  
AND ビルド成果物に `kernel/step-names` のモジュールが含まれる

---

### TC-013: bun run lint が green

**Category**: integration
**Priority**: must
**Source**: T-04 受け入れ基準

**GIVEN** 全ての変更が適用されている  
**WHEN** `bun run lint` を実行する  
**THEN** exit code が 0 である  
AND lint エラー・警告が 0 件である

---

### TC-014: bun run test（architecture enforcement）が green

**Category**: integration
**Priority**: must
**Source**: T-03 / T-04 受け入れ基準

**GIVEN** R3 エントリが削除され、config/state の import が kernel を向いている  
**WHEN** `bun run test` を実行する  
**THEN** exit code が 0 である  
AND architecture enforcement suite（`core-invariants.test.ts`）が green  
AND B-3 invariant テストが `config/migrate.ts` と `state/schema.ts` に対して違反を報告しない  
AND 既存の他テスト（`step-names.test.ts`, `rules-new.test.ts`, `adr-gen.test.ts` 等）が全て pass する

---

### TC-015: re-export barrel 経由で core/ 内部の import が引き続き機能する

**Category**: integration
**Priority**: must
**Source**: design D2

**GIVEN** src/core/step/step-names.ts が `export * from "../../kernel/step-names.js"` の barrel に変換されている  
**WHEN** `bun run typecheck` および `bun run build` を実行する  
**THEN** `core/pipeline/`, `core/command/`, `core/step/`, `core/resume/` 等 20+ ファイルで型エラーが発生しない  
AND これらのファイルの import path が変更されていない  
AND ビルドが exit code 0 で完了する

---

### TC-016: adapter/ および cli/ の import path が変更されていない

**Category**: unit
**Priority**: should
**Source**: design（B-3 非該当、変更不要）

**GIVEN** adapter/ および cli/ が step-names を import しているファイルが存在する  
**WHEN** これらのファイルの import 行を確認する  
**THEN** `adapter/managed-agent/agent-runner.ts` の step-names import path が変更前と同一である  
AND `cli/command-registry.ts` の step-names import path が変更前と同一である

---

### TC-017: テストファイルの import path が変更されていない

**Category**: unit
**Priority**: should
**Source**: design（テストは変更不要）

**GIVEN** tests/ 配下のファイルが step-names を import している  
**WHEN** これらのファイルの import 行を確認する  
**THEN** `tests/unit/core/step/step-names.test.ts` の import path が変更されていない  
AND `tests/unit/core/command/rules-new.test.ts` の import path が変更されていない  
AND `tests/unit/core/step/adr-gen.test.ts` の import path が変更されていない

---

### TC-018: state/schema.ts の core/port import がスコープ外として保持されている

**Category**: unit
**Priority**: must
**Source**: スコープ外 / 受け入れ基準（B3-state-port は残す）

**GIVEN** src/state/schema.ts が変更されている  
**WHEN** ファイルの import 行を確認する  
**THEN** `../core/port/model-usage.js` への import が残っている  
AND `../core/port/report-result.js` への import が残っている  
AND `arch-allowlist.ts` に `B3-state-port` エントリが存在する

---

### TC-019: burn-down priority コメントの R3 言及が更新されている

**Category**: unit
**Priority**: should
**Source**: T-03

**GIVEN** `arch-allowlist.ts` が変更されている  
**WHEN** ファイル冒頭の burn-down priority コメントを確認する  
**THEN** `R3 (step-names)` への言及が削除されているか「完了済み」として更新されている  
AND R1, R2, R4 の言及は残っている

---

### TC-020: 全体 verification コマンドが green

**Category**: integration
**Priority**: must
**Source**: 受け入れ基準（全体）

**GIVEN** 全ての変更（T-01 〜 T-03）が適用されている  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を順に実行する  
**THEN** 全 4 コマンドが exit code 0 で完了する  
AND 各コマンドでエラー・失敗が 0 件である

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 17
should: 3
could: 0
blocked_reasons: []
```
