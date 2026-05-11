# Tasks: finish-conflict-precheck

## T-01: pr-status.ts に checkMergeableForMerge 関数を追加

ファイル: `src/core/finish/pr-status.ts`

- [x] module-level 定数を追加: `MERGEABLE_RETRY_COUNT = 3`, `MERGEABLE_RETRY_DELAY_MS = 5000`
- [x] `checkMergeableForMerge` 関数を追加。引数: `{ prNumber, cwd, spawn, slug, baseBranch, sleepFn? }`
- [x] `gh pr view <prNumber> --json mergeable` を spawn で実行
- [x] JSON parse → `mergeable` フィールドを取得（`gh pr view` 失敗時は escalation）
- [x] `MERGEABLE` → `{ ok: true }` を返却
- [x] `CONFLICTING` → `{ ok: false, escalation }` を返却。escalation メッセージに `baseBranch` を使った rebase コマンド例を含める
- [x] `UNKNOWN` → `sleepFn(MERGEABLE_RETRY_DELAY_MS)` 後にリトライ。最大 `MERGEABLE_RETRY_COUNT` 回
- [x] リトライ超過 → escalation（`fetchPrViewWithRetry` の UNKNOWN 超過と同じパターン）
- [x] 関数を export する

受け入れ基準: `bun run typecheck` が green。

## T-02: orchestrator.ts の Phase 3 に guard を挿入

ファイル: `src/core/finish/orchestrator.ts`

- [x] `checkMergeableForMerge` を `pr-status.ts` から import
- [x] `MergePhase3Params` に `baseBranch: string` と `sleepFn?: (ms: number) => Promise<void>` を追加
- [x] `mergeFeaturePrPhase3` 関数の先頭（`const mergeArgs = ...` の前）に `checkMergeableForMerge` 呼び出しを追加
- [x] `ok: false` の場合は `{ ok: false, escalation: result.escalation, exitCode: 1 }` を即返却
- [x] `runFinishOrchestrator` 内の `mergeFeaturePrPhase3` 呼び出し箇所（L128-135）に `baseBranch` と `sleepFn` を追加

受け入れ基準: `bun run typecheck` が green。

## T-03: テスト更新

ファイル: `tests/finish-orchestrator.test.ts`

- [x] `makeHappyPathSpawn` に `gh pr view --json mergeable` の分岐を追加。`args.includes("mergeable")` で判定し `{ "mergeable": "MERGEABLE" }` を返す。既存の `gh pr view --json` 分岐より前に配置
- [x] TC-CONFLICT-001: `mergeable=CONFLICTING` で escalation。spawn mock で mergeable チェック時に `CONFLICTING` を返す。`gh pr merge` が呼ばれないことを assert。escalation メッセージに rebase 指示が含まれることを assert
- [x] TC-CONFLICT-003: `mergeable=UNKNOWN` → リトライ後 `MERGEABLE`。spawn mock で 1 回目 `UNKNOWN`、2 回目 `MERGEABLE` を返す。最終的に merge 成功（exitCode 0）
- [x] TC-CONFLICT-004: `mergeable=UNKNOWN` × 3 回リトライ超過。spawn mock で全回 `UNKNOWN` を返す。escalation で exitCode 1

受け入れ基準: `bun run test` が全 pass。

## T-04: delta spec 追加

ファイル: `specrunner/changes/finish-conflict-precheck/specs/cli-finish-command/spec.md`

- [x] `## ADDED Requirements` セクションに Phase 3 mergeable guard の Requirement を追加
- [x] `mergeable=CONFLICTING` → escalation の Scenario
- [x] `mergeable=UNKNOWN` → リトライ後成功の Scenario
- [x] `mergeable=UNKNOWN` × 3 → escalation の Scenario
- [x] `mergeable=MERGEABLE` → 通常 merge の Scenario

受け入れ基準: delta spec が `### Requirement:` / `#### Scenario:` / MUST / SHALL の規約に従っている。

## T-05: 検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が全 pass
