# Test Cases: core の検証済み死コードを削除する

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 25 + 1 gate
- **Manual**: 0
- **Priority**: must: 20, should: 6, could: 0

---

### TC-001: finish の死コードが削除されている

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 削除対象 symbol はすべてのコードパスで grep 0 件になる > Scenario: finish の死コードが削除されている

---

### TC-002: errors.ts の factory 7 個が削除されている

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 削除対象 symbol はすべてのコードパスで grep 0 件になる > Scenario: errors.ts の factory 7 個が削除されている

---

### TC-003: ERROR_CODES の 7 エントリが削除されている

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 削除対象 symbol はすべてのコードパスで grep 0 件になる > Scenario: ERROR_CODES の 7 エントリが削除されている

---

### TC-004: 残存 symbol が存在する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 削除しない symbol は残存している > Scenario: 残存 symbol が存在する

---

### TC-005: error-codes.test.ts が green のまま

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共有 test は削除対象 assertion のみ除去し他の期待値を変更しない > Scenario: error-codes.test.ts が green のまま

---

### TC-006: generate-chain-removed.test.ts が green のまま

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共有 test は削除対象 assertion のみ除去し他の期待値を変更しない > Scenario: generate-chain-removed.test.ts が green のまま

---

### TC-007: 全テストが green

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: typecheck && test が green > Scenario: 全テストが green

`bun run typecheck && bun run test` — typecheck phase + test phase

---

### TC-008: FinishFs が types.ts 部分削除後も archive モジュールで使用可能

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/finish/types.ts` から `PrViewData`・`ResolvedTarget`・`FinishContext`・`FinishFlags` が削除され、`FinishFs` は残存している
**WHEN** `grep "FinishFs" src/core/finish/types.ts` と `bun run typecheck` を実行する
**THEN** grep が 1 件以上マッチし、typecheck が 0 エラーで完了する

---

### TC-009: slugify が src/ bin/ tests/ で grep 0 件

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `src/util/slugify.ts` と `tests/unit/util/slugify.test.ts` が削除されている
**WHEN** `grep -r "slugify" src/ bin/ tests/` を実行する
**THEN** マッチ 0 件

---

### TC-010: paths.ts コメントから slugify が除去されている

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `src/util/paths.ts` のコメントが実態に合わせて修正されている
**WHEN** `grep "slugify" src/util/paths.ts` を実行する
**THEN** マッチ 0 件

---

### TC-011: state/reconcile が完全削除される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/state/reconcile.ts` と `tests/unit/state/reconcile.test.ts` が削除されている
**WHEN** `grep -r "state/reconcile" src/ tests/` を実行する
**THEN** マッチ 0 件

---

### TC-012: 保護対象 ERROR_CODES（BRANCH_NOT_REGISTERED・STATE_FILE_INVALID・STEP_INPUT_MISSING）が残存する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** T-04 の factory 削除と ERROR_CODES 7 エントリ削除が完了している
**WHEN** `grep -r "BRANCH_NOT_REGISTERED\|STATE_FILE_INVALID\|STEP_INPUT_MISSING" src/` を実行する
**THEN** 各コードの定義行が src/ に 1 件以上マッチする

---

### TC-013: barrel/tombstone 4 ファイルが存在しない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `src/core/event/index.ts`・`src/core/step/index.ts`・`src/store/index.ts`・`src/state/store.ts` が削除されている
**WHEN** 各ファイルの存在を確認する
**THEN** 4 ファイルがいずれも存在しない

---

### TC-014: barrel ファイルへの import が src/ tests/ で 0 件

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** TC-013 の 4 ファイルが削除されている
**WHEN** `grep -r "from.*core/event/index\|from.*core/step/index\|from.*store/index\|from.*state/store" src/ tests/` を実行する
**THEN** マッチ 0 件

---

### TC-015: request/manager.ts に resolve なし・list あり・ファイル存在

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `src/core/request/manager.ts` の `resolve` 関数のみが削除されている
**WHEN** `grep -n "resolve\b\|export.*list" src/core/request/manager.ts` を実行し、ファイルの存在を確認する
**THEN** `resolve` 関数定義が 0 件、`list` 関数定義が 1 件以上マッチし、ファイルが存在する

---

### TC-016: src/core/tools/ ディレクトリが存在しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `src/core/tools/types.ts` が削除されている
**WHEN** `ls src/core/tools/` を実行する
**THEN** ディレクトリが存在しない（コマンドがエラーになる）

---

### TC-017: agent-runner.test.ts の readdir assertion ブロックが削除されている

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D3

**GIVEN** `src/core/tools/` ディレクトリが削除されている
**WHEN** `grep "only types.ts remains" tests/unit/adapter/managed-agent/agent-runner.test.ts` を実行する
**THEN** マッチ 0 件

---

### TC-018: core/validation/ 削除後テストが src/parser/validation/ を直接 import して green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D4

**GIVEN** `src/core/validation/` が削除され、`registry.test.ts` と `rule-name-typesafe.test.ts` の import が `src/parser/validation/` に repoint されている
**WHEN** `bun run test tests/unit/core/validation/registry.test.ts tests/unit/parser/rules/rule-name-typesafe.test.ts` を実行する
**THEN** 両テストが green

---

### TC-019: core/doctor/index.ts 削除後 next-steps.test.ts が fallback 経路で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 / design.md > D5

**GIVEN** `src/core/doctor/index.ts` が削除されている
**WHEN** `bun run test tests/unit/doctor/next-steps.test.ts` を実行する
**THEN** テストが green（try/catch fallback が `next-steps.js` を直接 import して通過する）

---

### TC-020: allChecks が src/ tests/ で grep 0 件

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `src/core/doctor/checks/index.ts` の `allChecks` 定数と個別 re-export block が削除されている
**WHEN** `grep -r "allChecks" src/ tests/` を実行する
**THEN** マッチ 0 件

---

### TC-021: DoctorContext const が削除され interface が残存する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `src/core/doctor/types.ts` の `export const DoctorContext: undefined = undefined` が削除されている
**WHEN** `grep "export const DoctorContext\|export interface DoctorContext" src/core/doctor/types.ts` を実行する
**THEN** `const` 行が 0 件、`interface` 行が 1 件以上マッチする

---

### TC-022: core/port/index.ts が削除され TC-010 ブロックが存在しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** `src/core/port/index.ts` が削除され、`tests/unit/generate-chain-removed.test.ts` の TC-010 describe ブロックが削除されている
**WHEN** `grep "TC-010\|PORT_INDEX_PATH" tests/unit/generate-chain-removed.test.ts` を実行する
**THEN** マッチ 0 件

---

### TC-023: prompts の不使用 wrapper が src/ tests/ で grep 0 件

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-11

**GIVEN** `buildSpecFixerSystemPrompt`・`SpecFixerPromptInput`・`buildSpecReviewSystemPrompt` が削除され、専用 test も削除されている
**WHEN** `grep -r "buildSpecFixerSystemPrompt\|SpecFixerPromptInput\|buildSpecReviewSystemPrompt" src/ tests/` を実行する
**THEN** マッチ 0 件

---

### TC-024: requestReviewResultPath の re-export が削除されている

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-11

**GIVEN** `src/prompts/request-review-system.ts` の `requestReviewResultPath` re-export が削除されている
**WHEN** `grep "requestReviewResultPath" src/prompts/request-review-system.ts` を実行する
**THEN** マッチ 0 件

---

### TC-025: kernel/tool-types.ts の 3 symbol が削除され CustomToolContext 等が残存する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** `defineCustomTool`・`CustomTool`・`CustomToolDefinition` が削除されている
**WHEN** `grep -r "defineCustomTool\|CustomToolDefinition" src/ tests/` と `grep "CustomToolContext\|CustomToolResult\|CustomToolHandler" src/kernel/tool-types.ts` を実行する
**THEN** 前者 0 件、後者各 symbol の定義行が 1 件以上マッチする

---

### TC-026: derive-usage.ts・orchestrator 呼び出し block・vi.mock が src/ tests/ で grep 0 件

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-13 / design.md > D6

**GIVEN** `src/core/finish/derive-usage.ts` が削除され、`src/core/archive/orchestrator.ts` の `deriveAndWriteUsage` 呼び出し block と import が削除され、3 テストファイルの `vi.mock` 行が削除されている
**WHEN** `grep -r "deriveAndWriteUsage\|DeriveUsageResult\|derive-usage" src/ tests/` を実行する
**THEN** マッチ 0 件

---

## Result

```yaml
result: completed
total: 26
automated: 26
manual: 0
must: 20
should: 6
could: 0
blocked_reasons: []
```
