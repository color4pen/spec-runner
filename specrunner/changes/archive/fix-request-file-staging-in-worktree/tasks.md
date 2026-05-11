## 1. request file の staging 追加

- [x] 1.1 `src/cli/run.ts` に `spawnCommand` を `../util/spawn.js` から import する
- [x] 1.2 L239（`fs.cp`）の直後に以下を追加:
  - `spawnCommand("git", ["add", relativeRequestPath], { cwd: worktreePath })` を `await` で実行
  - exit code が非ゼロの場合、`process.stderr.write` でエラーメッセージを出力し `return 1` で終了（fail-fast）
- [x] 1.3 `bun run typecheck` が green であることを確認

## 2. テスト

- [x] 2.1 `bun test` が既存テスト全件 green であることを確認
- [x] 2.2 必要に応じて run.ts の worktree 統合箇所に対する unit test を追加（`spawnCommand` を DI できる場合）
  - run.ts は DI 未対応のため、Design D1 の失敗パスを reconstruction パターンで検証する unit test を追加（`tests/unit/cli/run-worktree-git-staging.test.ts`）

## 3. 検証

- [x] 3.1 `openspec validate fix-request-file-staging-in-worktree --type change --strict` が pass
- [x] 3.2 `bun run typecheck && bun test` が green
