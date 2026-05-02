# Implementation Notes

## Status
- **result**: completed
- **tasks_completed**: 46/48
- **note**: tasks 8.2/8.3/8.4 are verification/review steps left for pipeline; all code tasks complete

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| src/state/schema.ts | modified | Added `slug?: string | null` to `RequestInfo`; backward-compat null-fill in `validateJobState` |
| src/state/store.ts | modified | `createJobState` normalizes `slug` to `null` when not provided |
| src/state/job-slug.ts | new | Pure helpers: `getJobSlug(state)` fallback chain (slug → branch → path basename); `stripBranchPrefix` for 5 known prefixes |
| src/cli/run.ts | modified | Canonical path detection via regex → populates `state.request.slug` from directory name |
| src/cli/finish.ts | rewritten | New interface `RunFinishOptions` with `slug?/prNumber?/jobId?/dryRun?`; escalation to stderr |
| src/cli/ps.ts | modified | Added SLUG column (index 1), `--all` flag to include archived, default hides archived |
| bin/specrunner.ts | modified | USAGE updated for `finish [<slug>] [--pr=<n>] [--job=<id>] [--dry-run]`; ps `--all` parsing |
| src/core/finish/archive-pr.ts | deleted | Removed 2-PR model: `createArchivePr`, `pushAndCreateArchivePr`, `prepareArchiveBranch`, `checkArchivePrAlreadyMerged` |
| src/core/finish/orchestrator.ts | rewritten | Phase 0-4 orchestration: preflight → archive on feature branch → push → merge → finalize |
| src/core/finish/preflight.ts | new | 8 pre-flight checks; injectable `sleepFn` for testability; `formatEscalation` throughout |
| src/core/finish/resolve-target.ts | rewritten | 4-form resolution: `<slug>` → `--pr` reverse lookup → `--job` → auto-detect |
| src/core/finish/types.ts | modified | Added `dryRun?: boolean` to `FinishFlags` |
| src/core/finish/escalation.ts | exists | `formatEscalation` 4-field contract used throughout |
| src/core/tools/register-branch.ts | rewritten | Optional `slug` field in input_schema; handler derives slug via `stripBranchPrefix` when absent; returns `{ ok, branch, slug }` |
| src/adapter/anthropic/sse-stream.ts | modified | Added `onSlugRegistered` callback propagation on `register_branch` response |
| src/core/port/session-client.ts | modified | Added `onSlugRegistered?: (slug: string) => void` to `streamEvents` opts |
| src/adapter/anthropic/session-client.ts | modified | Forwards `onSlugRegistered` to `runSseStream` |
| src/core/step/executor.ts | modified | Captures `registeredSlug` via `onSlugRegistered`; updates `state.request.slug` when branch registered |
| tests/state/job-slug.test.ts | new | 16 unit tests for `getJobSlug` and `stripBranchPrefix` (TC-111~TC-118) |
| tests/finish-adversarial.test.ts | new | 8 adversarial tests: TC-104/105/107/119/120/121/129/139 |
| tests/finish-orchestrator.test.ts | rewritten | 1-PR model tests: TC-122/123/124/125/126 and happy/resume paths |
| tests/finish-resolve-target.test.ts | rewritten | New 4-form resolve-target API tests |
| tests/finish-ps-integration.test.ts | modified | Added TC-110 (SLUG column + --all), TC-142 (no --all hides archived), TC-143 (TAB-separated SLUG) |
| tests/register-branch-schema.test.ts | modified | Added TC-127 (explicit slug input), TC-128 (derived from branch) handler tests |
| tests/finish-archive-pr.test.ts | deleted | Removed 2-PR model test file |
| tests/core/step/step-interface.test.ts | modified | Relaxed schema assertion for backward compat with optional slug |
| openspec-workflow/adr/ADR-20260502-finish-1pr-model.md | new | ADR documenting 2-PR → 1-PR model decision |
| openspec/changes/finish-redesign/tasks.md | modified | Updated task checkboxes to completed |

## Fix History

### code-fixer pass 1 (2026-05-02) — review-feedback-001 対応

| Finding | Files | Summary |
|---------|-------|---------|
| HIGH #1 | `src/core/finish/merge-feature-pr.ts` (deleted), `tests/finish-merge-feature-pr.test.ts` (deleted) | 2-PR モデル時代の dead code 削除。Phase 3 は orchestrator.ts 内 `mergeFeaturePrPhase3` に実装済み |
| HIGH #1 (chain) | `src/core/finish/escalation.ts` | `getRecommendedAction` 関数と `NormalizedPrState` import を削除。`formatEscalation` のみ残存 |
| HIGH #1 (chain) | `src/core/finish/types.ts` | `NormalizedPrState` 型、`ALL_NORMALIZED_PR_STATES` 定数、`FinishFlags.cleanupOnly` deprecated field を削除 |
| MEDIUM #2 | `src/core/finish/pr-state.ts` (deleted), `tests/finish-pr-state.test.ts` (deleted) | dead code 削除 |
| MEDIUM #3 | `src/core/finish/archive-openspec.ts` | escalation の `${jobId}` を `${slug}` に統一。`jobId` パラメータを削除 |
| MEDIUM #3 | `src/core/finish/move-requests-dir.ts` | 同上。`jobId` パラメータを削除 |
| MEDIUM #3 | `src/core/finish/orchestrator.ts` | `archiveOpenspec` / `moveRequestsDir` 呼び出しから `jobId:` 引数を削除 |
| MEDIUM #4 | `src/core/finish/types.ts` | HIGH #1 (chain) と一体で対処済み |
| MEDIUM #5 | `src/core/finish/orchestrator.ts:197-241` | Phase 4 worktree-aware 化。`git rev-parse --abbrev-ref HEAD` で現ブランチを確認し、`main` でない場合は checkout/pull をスキップして警告ログのみ出力 |
| MEDIUM #5 | `openspec/changes/finish-redesign/specs/cli-finish-command/spec.md` | Phase 4 worktree シナリオの Scenario を追加。Phase コードブロックに補注を追記 |
| MEDIUM #6 | `src/core/finish/escalation.ts` | HIGH #1 (chain) と一体で対処済み |
| LOW #7 | `src/core/finish/idempotency.ts` | コメントを `TC-126: state.status=archived → "Already archived" no-op` に更新 |
| LOW #8 | `openspec/changes/finish-redesign/module-analysis.md` | §1.1 冒頭に削除済みファイルの補注を追加。ストライクスルーで削除済みエントリを明示 |
| LOW #9 | `tests/finish-merge-feature-pr.test.ts` (deleted), `tests/finish-pr-state.test.ts` (deleted) | HIGH #1/#2 と一体で対処済み |

テスト更新: `tests/finish-archive-openspec.test.ts` と `tests/finish-move-requests-dir.test.ts` の `BASE` から `jobId` を削除（型エラー解消）。`tests/finish-orchestrator.test.ts` の `makeHappyPathSpawn` に `git rev-parse --abbrev-ref HEAD → "main"` ハンドラを追加（Phase 4 worktree-aware 対応）。

## Blocked Tasks

なし。コード実装タスク（1-7 章）は全て完了。

tasks 8.2/8.3/8.4（openspec validate / typecheck+test verification / final review）は pipeline の後続ステップで実行される。

## Key Decisions

- **`slug?: string | null`（optional）**: 当初 `slug: string | null`（required）で実装したが、既存のテストファイル 20+ 件が `RequestInfo` を `slug` なしで構築していたため TypeScript エラーが発生。`slug?` に変更して backward compat を維持。

- **`sleepFn` injectable**: preflight の UNKNOWN retry が `setTimeout`-based の 3 秒スリープを使うため、テストがタイムアウトした。`PreflightInput` に `sleepFn?: (ms: number) => Promise<void>` を追加し、テストは `() => Promise.resolve()` を渡すことで解決。

- **`fetchPrViewWithRetry` ではなく `runPreflight` に `sleepFn` を保持**: SRP の観点から `runPreflight` が entry point として `sleepFn` を受け取り、内部の `fetchPrViewWithRetry` に転送する設計を採用。

- **`register_branch` handler の state 更新**: handler は `CustomToolContext` のみ受け取り、state への direct access を持たない設計。slug 値の state 反映は SSE dispatcher（`executor.ts`）が `onSlugRegistered` callback 経由で実行する。

- **ADR は `openspec-workflow/adr/` に配置**: 既存の `ADR-20260416-*.md` パターンに倣い `ADR-20260502-finish-1pr-model.md` として生成。`adr-create` skill は使わずに直接ファイル生成。

- **tasks 7.11（2-PR テスト削除）**: `tests/finish-archive-pr.test.ts` が主要な 2-PR モデルテストファイルであり既に削除済み。残存する `tests/finish-*.test.ts` は 1-PR モデルのコンポーネント（`archiveOpenspec`, `moveRequestsDir`, `mergeFeaturePr` 等）をテストするため削除対象外。
