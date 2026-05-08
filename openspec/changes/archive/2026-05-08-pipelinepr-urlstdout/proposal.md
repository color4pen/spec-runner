## Meta

- **slug**: pipelinepr-urlstdout
- **type**: spec-change
- **date**: 2026-05-08

## Background

`specrunner run` の pipeline が `awaiting-merge` に到達した時点で、`src/core/command/runner.ts` の `handleResult()` は branch 名のみを stdout に出力する:

```
Pipeline completed; awaiting merge. Branch: <branch-name>
```

PR URL は `pr-create` step で `state.pullRequest.url` に保存済みだが、完了メッセージに含まれていない。ユーザーは PR を確認するために `gh pr view` または state file の直接読み取りが必要になる。

## Proposal

`handleResult()` 内の `status === "awaiting-merge"` 分岐で `finalState.pullRequest?.url` を参照し、存在する場合は PR URL を `logInfo` で追加出力する。`pullRequest` が未設定の場合（pr-create step 未実行、legacy state）は現行の branch 表示のみにフォールバックする。

## What Changes

- `src/core/command/runner.ts`: `handleResult()` の `awaiting-merge` 分岐に `logInfo` 1 行追加
- `openspec/specs/cli-commands/spec.md`: pipeline 完了時の PR URL 出力を delta spec で追加

## Impact

- **Affected code**: `src/core/command/runner.ts:172` 付近の 1 分岐のみ
- **Affected tests**: `handleResult` の既存テスト（あれば）に PR URL 表示ケースを追加
- **Backward compatibility**: `pullRequest` は optional field のため、未設定時は現行動作と同一。破壊的変更なし

## Acceptance Criteria

- [ ] pipeline 完了時（`status === "awaiting-merge"`）に PR URL が stdout に表示される
- [ ] `pullRequest` が未設定の場合は branch 名のみ表示され、エラーにならない
- [ ] delta spec が `openspec validate` を pass する
- [ ] `bun run typecheck && bun run test` が green
