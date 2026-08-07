# core の検証済み死コードを削除する

## Meta

- **type**: refactoring
- **slug**: dead-code-core
- **base-branch**: main
- **adr**: false

## 背景

コードベース監査で、静的 import・文字列参照・動的 import・test の disk 読み取りの 4 経路すべてで参照ゼロ（または専用 test のみ）と裏取りされた死コードが core 周辺に蓄積していることが判明した。本 request はそのうち「削除しても挙動が変わらないことが検証済み」の項目だけを削除する。参照が残る項目・ADR 裁定で保持と決まっている項目はスコープ外に明記する。

## 現状コードの前提

- `src/core/finish/resolve-target.ts:45` の `resolveTarget` と `src/core/finish/pr-status.ts:30` の `fetchPrViewWithRetry` は本番呼び出しゼロ（archive/ に置き換え済み）。参照は各専用 test（`tests/finish-resolve-target.test.ts`、`tests/unit/core/finish/pr-status.test.ts`）と `tests/unit/architecture/arch-allowlist.ts:433` の CWD-ratchet エントリのみ
- `src/core/finish/types.ts` のうち `PrViewData`(:10)・`ResolvedTarget`(:19)・`FinishContext`(:53)・`FinishFlags`(:62) は上記 2 ファイル以外に消費者なし。`FinishFs`(:35) は `src/core/archive/orchestrator.ts:20`・`src/core/archive/post-merge-cleanup.ts:11` が使用中
- `src/kernel/github-client.ts:113` のコメントが「PrViewData-compatible shape」と削除対象型を参照している
- `src/state/reconcile.ts` は本番参照ゼロ。本番の reconcile 経路は `src/core/resume/reconcile-worktree.ts`。参照は専用 test `tests/unit/state/reconcile.test.ts` のみ
- `src/util/slugify.ts` は本番参照ゼロ。参照は専用 test `tests/unit/util/slugify.test.ts` と `src/util/paths.ts:7` の stale コメントのみ
- `src/errors.ts` の factory 7 個は本番呼び出しゼロ: `branchNotRegisteredError`(:229)・`stateFileInvalidError`(:237)・`sessionCreateFailedError`(:253、adapter は `src/adapter/managed-agent/error-helpers.ts:26,45` で SESSION_CREATE_FAILED を inline 構築)・`noCommitDetectedError`(:277)・`stepHaltedNoToolCallError`(:366)・`stepInputMissingError`(:382、runtime は `ERROR_CODES.STEP_INPUT_MISSING` を直接使用: `src/core/runtime/local.ts:1414,1481`)・`authoritySpecEditViolationError`(:392)。`branchNotRegisteredError`・`stateFileInvalidError` は共有 test `tests/error-codes.test.ts` にも assertion がある
- `ERROR_CODES` のうち `AUTO_MERGE_UNAVAILABLE`・`GH_SUBPROCESS_FAILED`・`OPENSPEC_ARCHIVE_FAILED`・`SPEC_FIXER_NO_FINDINGS`・`AUTHORITY_SPEC_EDIT_VIOLATION`・`STEP_HALTED_NO_TOOL_CALL`・`NO_COMMIT_DETECTED` は factory 削除後に参照ゼロとなる。journal/state の `code` は opaque な string（`src/state/schema/types.ts:102`）で、code 値の enum 検証・switch は存在しないため、旧 code を含む既存 journal の読み取りは影響を受けない
- `src/core/event/index.ts`（3 行 barrel）・`src/core/step/index.ts`（6 行 barrel）・`src/store/index.ts`（3 行 barrel）・`src/state/store.ts`（7 行 tombstone コメントのみ）は importer ゼロ
- `src/core/request/manager.ts:19` の `resolve` は呼び出しゼロ。`list`(:3) は `src/core/command/request-list.ts` が使用中。`tests/unit/generate-chain-removed.test.ts:163` がこのファイルの内容を disk から読むため、ファイル自体は残す
- `src/core/tools/` は 1 行 re-export の `types.ts` のみで TS importer ゼロ。`tests/unit/adapter/managed-agent/agent-runner.test.ts:259-262` が directory を readdir して「types.ts のみ」を assert している
- `src/core/validation/` は 2 個の 5 行 re-export shim で src importer ゼロ。`tests/unit/core/validation/registry.test.ts:2-3` と `tests/unit/parser/rules/rule-name-typesafe.test.ts:8` が shim 経由で import している（実体は `src/parser/validation/`）
- `src/core/doctor/index.ts`（17 行）の importer は `tests/unit/doctor/next-steps.test.ts:17` の動的 import のみ（本番 `src/cli/doctor.ts:14` は submodule 直接 import）。`src/core/doctor/checks/index.ts:99` の `allChecks` は本番未使用（本番は commonChecks/managedChecks/localChecks）で、参照は `tests/core/doctor/checks/all-checks.test.ts:6` と `tests/core/doctor/doctor-cli.test.ts:19` の mock。`checks/index.ts:101-130` の個別 re-export block は importer ゼロ。`src/core/doctor/types.ts:90` の `export const DoctorContext: undefined = undefined` は値 import ゼロ（**type** としての DoctorContext は全 check が使用中 — 削除対象は const のみ）
- `src/core/port/index.ts`（6 行 barrel）は importer ゼロ。`tests/unit/generate-chain-removed.test.ts:187-199` がファイル内容を disk から読んでいる
- `src/prompts/spec-fixer-system.ts` の `buildSpecFixerSystemPrompt` と `SpecFixerPromptInput` は引数を無視して定数を返す wrapper で、本番は定数 `SPEC_FIXER_SYSTEM_PROMPT` を直接使用（`src/core/step/spec-fixer.ts:6`）。参照は専用 test `tests/prompts/spec-fixer-system.test.ts` のみ。`src/prompts/spec-review-system.ts:351` の `buildSpecReviewSystemPrompt` は参照ゼロ。`src/prompts/request-review-system.ts:181-182` の `requestReviewResultPath` re-export は importer ゼロ（全消費者が util/paths から直接 import）
- `src/kernel/tool-types.ts` の `defineCustomTool`・`CustomTool`・`CustomToolDefinition` は参照ゼロ（`CustomToolContext`・`CustomToolResult`・`CustomToolHandler` は port と managed-agent adapter が使用中）
- `src/core/finish/derive-usage.ts` の `deriveAndWriteUsage` は「permanent no-op（call site として保存）」と自己文書化された no-op で、呼び出しは `src/core/archive/orchestrator.ts:236-246` の 1 block。`tests/unit/no-worktree-archive.test.ts` 等が vi.mock している

## 要件

1. 上記の死コードを削除する。専用 test（削除対象だけを test するファイル）は test ごと削除、共有 test は該当 assertion/block のみ削除し他の期待値は変更しない
2. `src/core/tools/` と `src/core/validation/` は directory ごと削除し、依存 test を修正する（readdir assertion の block 削除、shim 経由 import の `src/parser/validation/` への repoint）
3. `deriveAndWriteUsage` は削除前に no-op であること（副作用・戻り値消費がないこと）を確認した上で、関数・orchestrator の呼び出し block・test の vi.mock を削除する
4. `src/core/doctor/index.ts` 削除に伴い `tests/unit/doctor/next-steps.test.ts:17` の動的 import を `next-steps.js` 直接に repoint する。`src/core/port/index.ts` 削除に伴い `tests/unit/generate-chain-removed.test.ts:187-199` の内容読み取り assertion を削除する
5. 削除対象を参照する stale コメント（`src/kernel/github-client.ts:113`、`src/util/paths.ts:7`）を実態に合わせて修正する

## スコープ外

- `resultFileNotFoundError`・`ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND`（契約 test `tests/unit/step/review-exit-contract.test.ts` が参照中）
- `ConfigStore` port（ADR `specrunner/adr/2026-05-31-structure-rulings.md:59` が保持を裁定）
- `excludeChangeFolderPaths`・`conformanceApprovedLatest`（ADR 裁定・active draft `specrunner/drafts/approval-revision-binding.md` が参照）
- `src/core/pipeline/run.ts` の wrapper 群（e2e test harness の入口として現役）
- adapter / cli / config / logger 領域の死コード（別 request）
- `FinishFs`・`ERROR_CODES.STEP_INPUT_MISSING`・type としての `DoctorContext` は削除しない

## 受け入れ基準

- [ ] 削除した各 symbol 名が src/ bin/ tests/ で grep 0 件（コメント内の言及含む）
- [ ] `FinishFs`・`ERROR_CODES.STEP_INPUT_MISSING`・`DoctorContext` 型・`request/manager.ts` の `list`・`CustomToolContext`/`CustomToolResult`/`CustomToolHandler` が残存している
- [ ] 共有 test（`tests/error-codes.test.ts`・`tests/unit/adapter/managed-agent/agent-runner.test.ts`・`tests/unit/generate-chain-removed.test.ts` 等）は該当 block の削除のみで、他の test 期待値に変更がない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 削除のみで代替実装を作らない（復元は git 履歴で可能）。「将来用に残す」は今回の判断基準に含めない
- `request/manager.ts` は `resolve` のみ削除しファイルは残す（test が disk からファイル内容を読むため）。ファイル統合は別途
- 却下した代替案: barrel の再構築（importer ゼロのため不要）、ERROR_CODES の後方互換 alias 残置（journal の code は opaque string で読み取り互換が保たれるため不要）
