# Tasks: core の検証済み死コードを削除する

## T-01: finish モジュールの死コードを削除する

- [x] `src/core/finish/resolve-target.ts` をファイルごと削除する
- [x] `src/core/finish/pr-status.ts` をファイルごと削除する
- [x] `src/core/finish/types.ts` から `PrViewData`（:10）・`ResolvedTarget`（:19）・`FinishContext`（:53）・`FinishFlags`（:62）の 4 interface を削除する（`FinishFs` は残す）
- [x] `src/kernel/github-client.ts:113` のコメント `PrViewData-compatible shape` を `PrViewData` への言及を除いた表現に修正する（例: `shape used by finish modules`）
- [x] 専用 test `tests/finish-resolve-target.test.ts` をファイルごと削除する
- [x] 専用 test `tests/unit/core/finish/pr-status.test.ts` をファイルごと削除する
- [x] `tests/unit/architecture/arch-allowlist.ts` から `src/core/finish/resolve-target.ts` の CWD-ratchet エントリを削除する（`resolve-target` と `CWD-finish-resolve-target-di-default` を含む行群）
- [x] `FinishFs` が `src/core/archive/orchestrator.ts`・`src/core/archive/post-merge-cleanup.ts`・`src/cli/archive.ts`・`src/core/archive/merge-then-archive.ts` で使われていることを確認し、`FinishFs` を残したまま import が通ることを確認する

**Acceptance Criteria**:
- `src/core/finish/types.ts` に `PrViewData`・`ResolvedTarget`・`FinishContext`・`FinishFlags` が存在しない
- `src/core/finish/types.ts` に `FinishFs` が残存している
- `src/core/finish/resolve-target.ts`・`src/core/finish/pr-status.ts` が存在しない
- `tests/finish-resolve-target.test.ts`・`tests/unit/core/finish/pr-status.test.ts` が存在しない
- `PrViewData`・`ResolvedTarget`・`FinishContext`・`FinishFlags`・`fetchPrViewWithRetry`・`resolveTarget` が src/ bin/ tests/ でコメント含め grep 0 件

## T-02: `src/util/slugify.ts` と stale コメントを削除する

- [x] `src/util/slugify.ts` をファイルごと削除する
- [x] `src/util/paths.ts:7` の `slugify, spawn` と書かれているコメントから `slugify,` を削除し、実態に合わせる（`spawn, atomic-write` など現存ファイルのみ列挙）
- [x] 専用 test `tests/unit/util/slugify.test.ts` をファイルごと削除する

**Acceptance Criteria**:
- `src/util/slugify.ts` が存在しない
- `tests/unit/util/slugify.test.ts` が存在しない
- `src/util/paths.ts` のコメントに `slugify` が含まれない
- `slugify` が src/ bin/ tests/ で grep 0 件（コメント含む）

## T-03: `src/state/reconcile.ts` を削除する

- [x] `src/state/reconcile.ts` をファイルごと削除する
- [x] 専用 test `tests/unit/state/reconcile.test.ts` をファイルごと削除する

**Acceptance Criteria**:
- `src/state/reconcile.ts`・`tests/unit/state/reconcile.test.ts` が存在しない
- `state/reconcile` が src/ bin/ tests/ で grep 0 件

## T-04: `src/errors.ts` の factory 7 個と対応 ERROR_CODES 7 個を削除する

削除対象の factory:
- `branchNotRegisteredError`（:229）
- `stateFileInvalidError`（:237）
- `sessionCreateFailedError`（:253）
- `noCommitDetectedError`（:277）
- `stepHaltedNoToolCallError`（:366）
- `stepInputMissingError`（:382）
- `authoritySpecEditViolationError`（:392）

削除対象の ERROR_CODES エントリ:
- `AUTO_MERGE_UNAVAILABLE`
- `GH_SUBPROCESS_FAILED`
- `OPENSPEC_ARCHIVE_FAILED`
- `SPEC_FIXER_NO_FINDINGS`
- `AUTHORITY_SPEC_EDIT_VIOLATION`
- `STEP_HALTED_NO_TOOL_CALL`
- `NO_COMMIT_DETECTED`

残存させる ERROR_CODES: `BRANCH_NOT_REGISTERED`・`STATE_FILE_INVALID`・`STEP_INPUT_MISSING` およびその他全コード

- [x] 上記 7 factory 関数を `src/errors.ts` から削除する（関数定義のみ。JSDoc 含む）
- [x] 上記 7 ERROR_CODES エントリを `src/errors.ts` の `ERROR_CODES` オブジェクトから削除する
- [x] `tests/error-codes.test.ts` の import リストから `branchNotRegisteredError`・`stateFileInvalidError` を削除する
- [x] `tests/error-codes.test.ts` の TC-024 describe ブロック全体（`branchNotRegisteredError()` を呼ぶ assertion のみ）を削除する。ただし `ERROR_CODES.BRANCH_NOT_REGISTERED` を確認する assertion は TC-026 で残す
- [x] `tests/error-codes.test.ts` の TC-026 内の `stateFileInvalidError()` を呼ぶ assertion（"STATE_FILE_INVALID is in ERROR_CODES and stateFileInvalidError produces that code" の it ブロック）のうち `stateFileInvalidError()` 呼び出しを削除し、`ERROR_CODES.STATE_FILE_INVALID` の確認のみに絞る
- [x] 削除した factory に紐づく専用 test があるか確認し、あれば削除する（`tests/unit/errors/` 以下など）

**Acceptance Criteria**:
- 上記 7 factory が src/ tests/ に存在しない
- 上記 7 ERROR_CODES エントリが src/ tests/ に存在しない
- `ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID`・`ERROR_CODES.STEP_INPUT_MISSING` が残存している
- `tests/error-codes.test.ts` が `branchNotRegisteredError`・`stateFileInvalidError` を import していない

## T-05: importer ゼロの barrel / tombstone ファイル 4 本を削除する

- [x] `src/core/event/index.ts` をファイルごと削除する
- [x] `src/core/step/index.ts` をファイルごと削除する
- [x] `src/store/index.ts` をファイルごと削除する
- [x] `src/state/store.ts` をファイルごと削除する

**Acceptance Criteria**:
- 上記 4 ファイルが存在しない
- `from.*core/event/index`・`from.*core/step/index`・`from.*store/index`・`from.*state/store` が src/ tests/ で grep 0 件

## T-06: `src/core/request/manager.ts` の `resolve` 関数のみを削除する

- [x] `src/core/request/manager.ts` の `resolve` 関数（:19-21）を削除する（`list` 関数は残す）
- [x] ファイル自体は残す（`tests/unit/generate-chain-removed.test.ts` がファイル内容を disk から読むため）

**Acceptance Criteria**:
- `src/core/request/manager.ts` に `resolve` 関数が存在しない
- `src/core/request/manager.ts` に `list` 関数が残存している
- ファイルが存在している

## T-07: `src/core/tools/` ディレクトリを削除し依存 test を修正する

- [x] `src/core/tools/types.ts`（1 行 re-export）をファイルごと削除する
- [x] `src/core/tools/` ディレクトリを削除する
- [x] `tests/unit/adapter/managed-agent/agent-runner.test.ts:259-264` の "register_branch does NOT exist in src/core/tools/ (only types.ts remains)" テストブロック（`it(...)` 1 件）を削除する

**Acceptance Criteria**:
- `src/core/tools/` ディレクトリが存在しない
- 削除したテストブロックが存在しない
- TC-017（同ファイル内 `register_branch` を確認する別テスト）が残存している

## T-08: `src/core/validation/` ディレクトリを削除し依存 test を修正する

- [x] `src/core/validation/registry.ts`（5 行 re-export shim）をファイルごと削除する
- [x] `src/core/validation/types.ts`（5 行 re-export shim）をファイルごと削除する
- [x] `src/core/validation/` ディレクトリを削除する
- [x] `tests/unit/core/validation/registry.test.ts` の import を `../../../src/core/validation/registry.js` から `../../../src/parser/validation/registry.js` に書き換える
- [x] `tests/unit/parser/rules/rule-name-typesafe.test.ts` の import を `../../../../src/core/validation/types.js`（または同等の shim 経由パス）から `../../../../src/parser/validation/types.js` に書き換える

**Acceptance Criteria**:
- `src/core/validation/` ディレクトリが存在しない
- 上記 2 テストファイルが `src/parser/validation/` から直接 import している
- `from.*core/validation` が src/ tests/ で grep 0 件

## T-09: `src/core/doctor` 周辺の 3 箇所を削除する

- [x] `src/core/doctor/index.ts`（17 行 barrel）をファイルごと削除する
  - `tests/unit/doctor/next-steps.test.ts` は try/catch fallback を持ち、index.js 削除後は自動的に `next-steps.js` を直接 import するため test 修正は不要であることを確認する
- [x] `src/core/doctor/checks/index.ts` の `allChecks` 定数（:99）を削除する
- [x] `src/core/doctor/checks/index.ts` の個別 re-export block（:101-130）を削除する（`commonChecks`・`managedChecks`・`localChecks` の定義と `DoctorCheck` import は残す）
- [x] `src/core/doctor/types.ts` の `export const DoctorContext: undefined = undefined`（:90）を削除する（`export interface DoctorContext` は残す）
- [x] 削除した `allChecks` のみを test している `tests/core/doctor/checks/all-checks.test.ts` をファイルごと削除する
- [x] `tests/core/doctor/doctor-cli.test.ts` の `vi.mock("...checks/index.js", ...)` ブロック内の `allChecks: [],` の **1 行のみ**を削除する（`commonChecks: []`・`managedChecks: []`・`localChecks: []` の行と vi.mock ブロック自体は残す）
- [x] `tests/unit/doctor/next-steps.test.ts` の line 14 のコメント `// Module does not exist yet — dynamic import defers the failure to test execution (RED until implementation)` を `// Tries index.ts first (re-export), falls back to next-steps.ts directly` に書き換える

**Acceptance Criteria**:
- `src/core/doctor/index.ts` が存在しない
- `src/core/doctor/checks/index.ts` に `allChecks`・個別 re-export block が存在しない
- `src/core/doctor/types.ts` に `DoctorContext` const が存在しない（interface は残存）
- `tests/unit/doctor/next-steps.test.ts` が green である（fallback 経路で動作）
- `allChecks` が src/ tests/ で grep 0 件

## T-10: `src/core/port/index.ts` を削除し依存 test を修正する

- [x] `src/core/port/index.ts`（6 行 barrel）をファイルごと削除する
- [x] `tests/unit/generate-chain-removed.test.ts` の TC-010 describe ブロック（:184-203）を丸ごと削除する（`PORT_INDEX_PATH` 使用行 3 テスト）

**Acceptance Criteria**:
- `src/core/port/index.ts` が存在しない
- `tests/unit/generate-chain-removed.test.ts` に TC-010 ブロックが存在しない
- `from.*core/port/index` が src/ tests/ で grep 0 件（`core/port/one-shot-query-client` 等の個別 import は無関係なので確認不要）

## T-11: `src/prompts` の不使用 wrapper / re-export を削除する

- [x] `src/prompts/spec-fixer-system.ts` の `SpecFixerPromptInput` interface（:59-63）と `buildSpecFixerSystemPrompt` 関数（:69-71）を削除する
- [x] `src/prompts/spec-review-system.ts` の `buildSpecReviewSystemPrompt` 関数（:153-155）を削除する（`SpecReviewPromptInput` interface は `buildSpecReviewInitialMessage` が使用中なので残す）
- [x] `src/prompts/request-review-system.ts` の `requestReviewResultPath` re-export（:181-182）を削除する（全消費者が `util/paths` から直接 import しているため不要）
- [x] 専用 test `tests/prompts/spec-fixer-system.test.ts` をファイルごと削除する

**Acceptance Criteria**:
- `buildSpecFixerSystemPrompt`・`SpecFixerPromptInput`・`buildSpecReviewSystemPrompt` が src/ tests/ で grep 0 件
- `request-review-system.ts` に `requestReviewResultPath` の re-export が存在しない
- `tests/prompts/spec-fixer-system.test.ts` が存在しない

## T-12: `src/kernel/tool-types.ts` の 3 symbol を削除する

- [x] `src/kernel/tool-types.ts` の `CustomToolDefinition` interface（:5-15）を削除する
- [x] `src/kernel/tool-types.ts` の `CustomTool` interface（:41-44）を削除する
- [x] `src/kernel/tool-types.ts` の `defineCustomTool` 関数（:50-52）を削除する
- [x] `CustomToolContext`・`CustomToolResult`・`CustomToolHandler` は残す

**Acceptance Criteria**:
- `defineCustomTool`・`CustomTool`・`CustomToolDefinition` が src/ tests/ で grep 0 件
- `CustomToolContext`・`CustomToolResult`・`CustomToolHandler` が残存している

## T-13: `src/core/finish/derive-usage.ts` を削除する

- [x] `deriveAndWriteUsage` の no-op 実装であること（副作用なし、`skipped: true` 常に返す）を最終確認する
- [x] `src/core/finish/derive-usage.ts` をファイルごと削除する（`DeriveUsageResult` interface 含む）
- [x] `src/core/archive/orchestrator.ts:236-249` の `deriveAndWriteUsage` 呼び出し try/catch block を丸ごと削除する（import 文 `derive-usage.js` も削除する）
- [x] `tests/unit/no-worktree-archive.test.ts` の `vi.mock("../../src/core/finish/derive-usage.js", ...)` 行を削除する
- [x] `tests/unit/core/archive/orchestrator.test.ts` の `vi.mock("../../../../src/core/finish/derive-usage.js", ...)` 行を削除する
- [x] `tests/unit/core/design-layer/orchestrator-hook.test.ts` の `vi.mock("../../../../src/core/finish/derive-usage.js", ...)` 行を削除する

**Acceptance Criteria**:
- `src/core/finish/derive-usage.ts` が存在しない
- `deriveAndWriteUsage`・`DeriveUsageResult` が src/ tests/ で grep 0 件
- `derive-usage` が src/ tests/ で grep 0 件

## T-14: `typecheck && test` で green を確認する

- [x] `bun run typecheck` が 0 エラーで通ること
- [x] `bun run test` が green であること
- [x] 削除した各 symbol 名を grep して 0 件であることを確認する（T-01〜T-13 の Acceptance Criteria を統合）

**Acceptance Criteria**:
- `typecheck` と `test` がどちらも green
- 受け入れ基準に列挙した全 symbol が src/ bin/ tests/ で grep 0 件（コメント含む）
- `FinishFs`・`ERROR_CODES.STEP_INPUT_MISSING`・`DoctorContext`（interface）・`request/manager.ts` の `list`・`CustomToolContext`/`CustomToolResult`/`CustomToolHandler` が残存している
