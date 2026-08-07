# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: 各 symbol の死コード主張を確認

**`src/core/finish/resolve-target.ts:45` (`resolveTarget`)**
- `src/` grep: `src/core/finish/resolve-target.ts:45` のみ（自己定義）
- `tests/` grep: `tests/finish-resolve-target.test.ts` のみ（専用 test）
- ✅ 本番呼び出しゼロ確認

**`src/core/finish/pr-status.ts:30` (`fetchPrViewWithRetry`)**
- `src/` grep: `src/core/finish/pr-status.ts:30` のみ（自己定義）
- `tests/` grep: `tests/unit/core/finish/pr-status.test.ts` のみ（専用 test）
- ✅ 本番呼び出しゼロ確認

**`src/core/finish/types.ts` の型群**
- `PrViewData` / `ResolvedTarget` / `FinishContext` / `FinishFlags`: `resolve-target.ts` と `pr-status.ts` のみが参照（どちらも死コード）
- `FinishFs`: `archive/orchestrator.ts:20`, `archive/post-merge-cleanup.ts:11`, `cli/archive.ts:16`, `archive/merge-then-archive.ts:26` で使用中 → **削除しない**が正しい
- ✅ スコープ外確認（FinishFs 残存の確認も含む）

**`src/kernel/github-client.ts:113`**
- 「Returns PrViewData-compatible shape for use by finish modules.」という stale コメントを確認
- ✅ Requirement 5（stale コメント修正）の対象として正しい

**`src/state/reconcile.ts`**
- `src/` に `from.*state/reconcile` の import なし（本番参照ゼロ）
- 本番の reconcile 経路は `src/core/resume/reconcile-worktree.ts`（`reconcileWorktreeArtifacts`）と確認
- `tests/unit/state/reconcile.test.ts` が唯一の参照（専用 test）
- ✅ 本番参照ゼロ確認

**`src/util/slugify.ts`**
- `src/` に `from.*util/slugify` の import なし（本番参照ゼロ）
- `src/util/paths.ts:7` に stale コメント（"alongside other stateless utilities (slugify, spawn, etc.)"）あり
- `tests/unit/util/slugify.test.ts` が参照 — ただし **⚠️ Finding あり**（後述）
- ✅ 本番参照ゼロ確認

**`src/errors.ts` の factory 7 個**

| factory | 本番呼び出し |
|---|---|
| `branchNotRegisteredError` | src/ に呼び出しなし（定義のみ） |
| `stateFileInvalidError` | src/ に呼び出しなし（定義のみ） |
| `sessionCreateFailedError` | src/ に呼び出しなし（adapter は `"SESSION_CREATE_FAILED"` を直接構築） |
| `noCommitDetectedError` | src/ に呼び出しなし（定義のみ） |
| `stepHaltedNoToolCallError` | src/ に呼び出しなし（定義のみ） |
| `stepInputMissingError` | src/ に呼び出しなし（runtime は `ERROR_CODES.STEP_INPUT_MISSING` を直接使用: `local.ts:1414,1481`） |
| `authoritySpecEditViolationError` | src/ に呼び出しなし（定義のみ） |

- `ERROR_CODES.STEP_INPUT_MISSING` は本番で直接使用 → 削除しないが正しい ✅
- `ERROR_CODES.BRANCH_NOT_REGISTERED` は `src/core/pipeline/run.ts:124` にコメント参照あり、`ERROR_CODES.STATE_FILE_INVALID` は `store/job-location-resolver.ts`, `finish/job-state-update.ts` で直接使用中 → これら 2 つは ERROR_CODES から削除しない（request の主張と一致）
- 削除対象 7 codes: `AUTO_MERGE_UNAVAILABLE`・`GH_SUBPROCESS_FAILED`・`OPENSPEC_ARCHIVE_FAILED`・`SPEC_FIXER_NO_FINDINGS`・`AUTHORITY_SPEC_EDIT_VIOLATION`・`STEP_HALTED_NO_TOOL_CALL`・`NO_COMMIT_DETECTED` — いずれも本番参照なし（factory を削除後は参照ゼロ）
- ✅ 全 7 factory・7 ERROR_CODES の死コード確認

**barrel/tombstone ファイル群**
- `src/core/event/index.ts`（3行）: src/ に `from.*core/event/index|from.*core/event"` の import なし
- `src/core/step/index.ts`（6行）: src/ に同様 import なし
- `src/store/index.ts`（3行）: src/ に同様 import なし
- `src/state/store.ts`（7行 tombstone）: src/ に `from.*state/store"` の import なし
- ✅ すべて importer ゼロ確認

**`src/core/request/manager.ts:19` (`resolve`)**
- `src/` 全体に `resolve` の呼び出しなし（`request/manager` 経由での呼び出しも含め）
- `manager.list` は `src/core/command/request-list.ts:1` が使用中 → ファイルは残す
- `tests/unit/generate-chain-removed.test.ts:163` がファイル内容を `readFileSync` → ファイル削除不可
- ✅ `resolve` のみ削除・ファイル残存の方針を確認

**`src/core/tools/`**
- `src/core/tools/types.ts` のみ（1行 re-export）: src/ に `from.*core/tools` の import なし
- `tests/unit/adapter/managed-agent/agent-runner.test.ts:259-262` が `readdir` でディレクトリを確認
- ✅ TS importer ゼロ確認

**`src/core/validation/` shim 群**
- `registry.ts`・`types.ts` 両方: src/ に `from.*core/validation` の import なし
- `tests/unit/core/validation/registry.test.ts:2-3` と `tests/unit/parser/rules/rule-name-typesafe.test.ts:8` が shim 経由 import → 削除後に `src/parser/validation/` へ repoint が必要
- ✅ src importer ゼロ確認

**`src/core/doctor/index.ts`**
- src/ に `from.*core/doctor/index|from.*core/doctor"` の import なし（本番はサブモジュールを直接 import）
- `cli/doctor.ts:14` は `runner.js`, `checks/index.js`, `formatter.js`, `types.js` を直接 import
- `tests/unit/doctor/next-steps.test.ts:17` が動的 import → 削除後 `next-steps.js` への直接 import に repoint
- ✅ 本番 importer ゼロ確認

**`src/core/doctor/checks/index.ts` の `allChecks` と個別 re-export block**
- `allChecks`: src/cli/doctor.ts は `commonChecks`, `managedChecks`, `localChecks` を直接使用。`allChecks` は未使用（`allChecks` の `src/` 参照は tests のみ）
- 個別 re-export block（行 101-130）: src/ に呼び出しなし
- ✅ 確認

**`src/core/doctor/types.ts:90` (`DoctorContext` const)**
- `import { DoctorContext }` の value import なし（全 import が `import type`）
- `index.ts:6` も `export type { DoctorContext, ... }` の形式（type-only re-export）
- `DoctorContext` **型** は全 check ファイルで広く使用中 → const のみ削除が正しい
- ✅ const value import ゼロ確認

**`src/core/port/index.ts`**
- src/ に `from.*core/port/index|from.*core/port"` の import なし（importer ゼロ）
- `tests/unit/generate-chain-removed.test.ts:187-199` がファイル内容を `readFileSync` → 削除時にこのブロックを削除
- ✅ importer ゼロ確認

**`src/prompts/spec-fixer-system.ts` の `buildSpecFixerSystemPrompt` / `SpecFixerPromptInput`**
- `buildSpecFixerSystemPrompt`: src/ に定義のみ（呼び出しなし）。本番は `SPEC_FIXER_SYSTEM_PROMPT` 定数を直接使用（`spec-fixer.ts:6`）
- `SpecFixerPromptInput`: src/ に定義のみ（`_input?: SpecFixerPromptInput` パラメータ型としてのみ）
- `tests/prompts/spec-fixer-system.test.ts` が専用 test → ファイルごと削除
- `SPEC_FIXER_SYSTEM_PROMPT` 定数は fragment/skeleton tests が使用中 → 残存
- ✅ wrapper + 型の死コード確認

**`src/prompts/spec-review-system.ts:153` (`buildSpecReviewSystemPrompt`)**
- src/・tests/ 両方に呼び出しゼロ確認
- ⚠️ **stale 行番号**: request は line 351 と記載するが、ファイルは 206 行しかなく実際は line 153。ただし主張（参照ゼロ）は正確
- `SpecReviewPromptInput` は `buildSpecReviewInitialMessage`（本番使用中）が使用中 → 削除しない
- ✅ 主張の本質は正確（行番号のみ stale）

**`src/prompts/request-review-system.ts:181-182` (`requestReviewResultPath` re-export)**
- `from.*request-review-system` の import: `src/core/step/request-review.ts:9` は `REQUEST_REVIEW_SYSTEM_PROMPT` と `buildRequestReviewInitialMessage` のみ import。`requestReviewResultPath` は `util/paths.js` から直接 import
- ✅ re-export の importer ゼロ確認

**`src/kernel/tool-types.ts` の `defineCustomTool` / `CustomTool` / `CustomToolDefinition`**
- src/・tests/ 両方に定義ファイル以外での参照なし
- `CustomToolContext`・`CustomToolResult`・`CustomToolHandler` は adapter と port で使用中（残存が正しい）
- ✅ 3 symbol の死コード確認

**`src/core/finish/derive-usage.ts` (`deriveAndWriteUsage`)**
- 実装確認: 常に `{ ok: true, skipped: true, message: "..." }` を返す pure no-op
- `orchestrator.ts:238-246` の呼び出しブロック確認: `usageResult.ok` は未使用、`!usageResult.skipped` が常に false → `stdoutWrite` は実行されない
- vi.mock: 3 ファイル（`no-worktree-archive.test.ts:28`, `orchestrator.test.ts:41`, `orchestrator-hook.test.ts:34`）が mock → これらの mock ブロックを削除
- ✅ 副作用ゼロ・戻り値消費なしを確認

### Step 2: スコープ外の確認

- `FinishFs` 残存: `archive/` 系 4 ファイルで使用中 ✅
- `ERROR_CODES.STEP_INPUT_MISSING` 残存: runtime で直接使用 ✅
- `DoctorContext` type 残存: 全 check ファイルで使用中 ✅
- `request/manager.ts` の `list` 残存: `request-list.ts` が使用 ✅
- `CustomToolContext`/`CustomToolResult`/`CustomToolHandler` 残存: sse-stream.ts・session-client.ts 等で使用 ✅

### Step 3: arch-allowlist の影響確認

- `tests/unit/architecture/arch-allowlist.ts:433` に `src/core/finish/resolve-target.ts` の CWD エントリがある
- CWD invariant test は「un-allowlisted な process.cwd() を検出」するものであり、stale なエントリ（削除済みファイルへの参照）はテスト失敗を引き起こさない
- ただしメンテナンス上はクリーンアップが望ましい（request には明示されていない）

## 検証できなかった項目

None。主要な dead コードの主張はすべて grep で実証的に確認できた。

## Findings 詳細

### Finding 1: `src/prompts/spec-review-system.ts:351` — stale 行番号

request の記載「`src/prompts/spec-review-system.ts:351`」はファイルの実際のサイズ（206 行）を超えている。`buildSpecReviewSystemPrompt` の実際の位置は line 153。主張（参照ゼロ）は正確なので実装上の影響はないが、修正が必要。

### Finding 2: `tests/unit/util/slugify.test.ts` — "専用 test" の誤認

request は「専用 test `tests/unit/util/slugify.test.ts`」としてファイル丸ごと削除を示唆するが、このファイルには `checkSlugCollision` describe block（lines 110-146）が含まれており、`checkSlugCollision` は `src/core/command/request-new.ts:31` で使用中の本番コードである。ファイルを丸ごと削除すると本番コードのテストカバレッジが失われる。

**正しいアプローチ**: `slugify` describe block（lines 12-108）と関連 import のみを削除し、`checkSlugCollision` describe block は残す（ファイル自体は残す）。
