# finish Phase 3 の branch 削除を worktree 削除後に移動する

## Meta

- **type**: spec-change
- **slug**: finish-worktree-branch-delete-order

## 背景

`specrunner finish` の Phase 3 で `gh pr merge --squash --delete-branch` を実行するが、worktree が feature branch を占有しているため branch 削除が失敗する。merge 自体は成功するが、branch 削除エラーで Phase 3 が escalation になり、再実行が必要。

## 要件

1. Phase 3 の `gh pr merge` から `--delete-branch` を外す
2. Phase 4（worktree 削除後）で feature branch を削除する（`git branch -D <branch>` + `git push origin --delete <branch>`）
3. `cli-finish-command` spec の Phase 3 記述を更新する delta spec を追加

## 受け入れ基準

- [ ] finish が worktree ありの job で 1 回の実行で完走する
- [ ] feature branch が Phase 4 で削除される
- [ ] delta spec が `openspec validate` を pass する
- [ ] `bun run typecheck && bun run test` が green
