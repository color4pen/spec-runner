# 並列 run 時の git worktree add ロック競合を修正する

## Meta

- **slug**: fix-worktree-lock-contention
- **type**: bug-fix
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

複数の `specrunner run` を同時に起動すると、`git worktree add` が `.git/config` のロックを取り合い一部が失敗する。

```
error: could not lock config file .git/config: File exists
error: unable to write upstream branch configuration
```

現在のワークアラウンドは起動を `sleep 3` でずらすこと。

GitHub Issue #166。

## 目的

worktree 作成時にロック競合が発生した場合、自動リトライで吸収する。

## 要件

1. `src/core/runtime/local.ts` の `setupWorkspace()` 内の `git worktree add` 呼び出しで、ロック競合エラー（`could not lock config file`）を検知する

2. ロック競合を検知した場合、ランダムな待機時間（1-5秒）を挟んで最大3回リトライする

3. 3回リトライしても失敗する場合はエラーを throw する（既存動作）

4. リトライの経過をログ出力する（`Retrying worktree add: lock contention (attempt N/3)`）

## 受け入れ基準

- [ ] ロック競合時に自動リトライが動作する
- [ ] 3回リトライ後に失敗した場合はエラーが throw される
- [ ] リトライのログが出力される
- [ ] 正常な worktree 作成に影響しない
- [ ] `bun run typecheck` / `bun run test` が全 pass
