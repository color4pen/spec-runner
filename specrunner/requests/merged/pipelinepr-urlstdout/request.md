# pipeline 完了時に PR URL を stdout に表示する

## Meta

- **type**: spec-change
- **slug**: pipelinepr-urlstdout

## 背景

`specrunner run` の pipeline 完了時、`src/core/command/runner.ts:172` は以下のメッセージを出力する:

```
Pipeline completed; awaiting merge. Branch: <branch-name>
```

PR URL は `pr-create` step で `state.pullRequest.url` に保存されているが、完了メッセージには含まれていない。ユーザーは PR を確認するために `gh pr view` を実行するか、state file を直接読む必要がある。

pipeline の最終出力に PR URL を含めれば、ユーザーは terminal から直接 PR を開ける。

## 要件

1. `src/core/command/runner.ts:172` の `handleResult()` で `finalState.pullRequest?.url` が存在する場合、PR URL を stdout に出力する
2. `pullRequest` が未設定の場合（pr-create step が未実行、または legacy state）は現行の branch 表示のみにフォールバックする
3. `cli-commands` spec に pipeline 完了時の PR URL 出力を delta spec として追加する

## スコープ外

- `specrunner resume` 完了時の PR URL 表示（resume の completion path は別 change で扱う）
- PR URL のクリップボードコピー等の UX 拡張
- `specrunner finish` 側の出力変更

## 受け入れ基準

- [ ] pipeline 完了時（`status === "awaiting-merge"`）に PR URL が stdout に表示される
- [ ] `pullRequest` が未設定の場合は branch 名のみ表示され、エラーにならない
- [ ] delta spec が `openspec validate` を pass する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `handleResult()` 内で `finalState.pullRequest?.url` を参照するだけで済む。新たな依存や型変更は不要
- 出力フォーマットは `logInfo` 1 行追加。構造化出力（JSON 等）は現時点では over-engineering