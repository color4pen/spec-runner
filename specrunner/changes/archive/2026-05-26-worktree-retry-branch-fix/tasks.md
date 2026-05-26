# Tasks: worktree-retry-branch-fix

## Task 1: [x] retry loop 内で branch 存在チェック + args 切り替え

**file**: `src/core/worktree/manager.ts`

`create()` の retry loop を以下のように修正:

1. `const wtArgs` を `let wtArgs` に変更
2. lock contention で retry する前に `git rev-parse --verify refs/heads/<branchName>` を実行
3. branch が存在すれば `wtArgs` を `["worktree", "add", worktreePath, branchName]` に切り替え（`-b` を外す）
4. branch が存在しなければ元の `-b` 付き args を維持

**注意**: `branchName` が undefined（`--detach` モード）の場合はチェック自体をスキップ。

## Task 2: [x] 全 retry 失敗時の branch cleanup

**file**: `src/core/worktree/manager.ts`

throw する直前に `branchName` が指定されている場合のみ `git branch -D <branchName>` を実行。
cleanup の失敗は無視する（次回 run の衝突防止が目的であり、失敗しても元の throw を妨げてはならない）。

## Task 3: [x] テスト追加

**file**: `tests/core/worktree/manager.test.ts`

以下のテストケースを追加:

- **TC-WTM-013**: lock contention → branch 存在 → `-b` なし retry で成功
  - spawn responses: worktree add fail (lock) → rev-parse success → worktree add success (without -b) → bun install success
  - assertion: 2 回目の worktree add に `-b` が含まれない、branchName が最後の引数

- **TC-WTM-014**: lock contention → branch 未存在 → `-b` 付き retry で成功
  - spawn responses: worktree add fail (lock) → rev-parse fail → worktree add success (with -b) → bun install success
  - assertion: 2 回目の worktree add に `-b` が含まれる

- **TC-WTM-015**: 全 retry 失敗 → branch cleanup 呼び出し
  - spawn responses: 3 回 lock contention fail + 各 rev-parse → 最後に branch -D
  - assertion: `git branch -D <branchName>` が呼ばれる

- **TC-WTM-016**: `--detach` モードで全 retry 失敗 → branch cleanup なし
  - spawn responses: 3 回 lock contention fail (branchName=undefined)
  - assertion: `git branch -D` が呼ばれない

## Task 4: [x] typecheck + test green 確認

`bun run typecheck && bun run test` を実行し、既存テスト含め全て green であることを確認。
