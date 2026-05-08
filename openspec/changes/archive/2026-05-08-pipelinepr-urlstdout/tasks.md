## 1. コード変更

- [x] 1.1 `src/core/command/runner.ts` の `handleResult()` 内、`status === "awaiting-merge"` 分岐で `finalState.pullRequest?.url` が truthy の場合に `logInfo(`PR: ${finalState.pullRequest.url}`)` を追加する。出力順は PR URL → branch 行（PR URL が先の方がユーザーがクリックしやすい）
- [x] 1.2 `pullRequest` が `undefined` の場合は PR URL 行を出力せず、既存の branch 行のみ表示されることを確認する

## 2. テスト

- [x] 2.1 `handleResult` に `pullRequest.url` を含む `JobState` を渡した場合、stdout に PR URL が出力されることを検証するテストを追加する
- [x] 2.2 `handleResult` に `pullRequest` が `undefined` の `JobState` を渡した場合、PR URL 行が出力されず branch 行のみであることを検証するテストを追加する
- [x] 2.3 `bun run typecheck && bun run test` が green であることを確認する

## 3. Spec 反映

- [x] 3.1 `openspec/changes/pipelinepr-urlstdout/specs/cli-commands/spec.md` に delta spec を作成済み（本 change folder に含まれる）
- [x] 3.2 `openspec validate pipelinepr-urlstdout --type change` が pass することを確認する

## Notes for Implementer

- `handleResult` は `src/core/command/runner.ts:157` に定義。`logInfo` / `logError` は既に import 済み
- `PullRequestInfo` 型は `src/state/schema.ts:128` に定義。`url: string` フィールドを持つ
- `JobState.pullRequest` は optional (`pullRequest?: PullRequestInfo`)
- 新たな import や型変更は不要
