## Why

local runtime は main cwd 上で全 step を実行するため、5 つの根本問題を抱えている:

1. request ファイルが feature branch にコミットされない（finish の `git mv` が失敗）
2. change folder が main の untracked files として漏れる
3. finish が feature branch に checkout して main cwd を汚す
4. verification step の temp worktree が cwd と競合する
5. finish の push 直後に merge が失敗する（mergeStateStatus が UNKNOWN のまま）

これらは全て「pipeline が main checkout 上で直接操作する」という設計に起因する。job 単位で git worktree を作成し、pipeline 全体をその worktree 内で実行することで根本解決する。

## What Changes

- `WorktreeManager` を新設し、worktree の作成・削除・prune を一元管理する
- `specrunner run` の local runtime パスで worktree を作成し、`deps.cwd` に worktree path を渡す
- `JobState` に `worktreePath` フィールドを追加し、crash recovery に備える
- finish が `state.worktreePath` から worktree 内で操作し、main cwd の checkout を不要にする
- verification / propagate の per-step temp worktree を廃止し、job worktree で直接実行する
- process signal handler（SIGINT/SIGTERM）で worktree を cleanup する

## Capabilities

### New Capabilities

- `worktree-management`: job 単位の persistent worktree の lifecycle 管理（create / remove / prune）
- `worktree-signal-cleanup`: SIGINT/SIGTERM 時に orphan worktree を残さない 3 層防御

### Modified Capabilities

- `local-runtime-execution`: main cwd → worktree cwd への切り替え。managed mode は不変
- `finish-orchestration`: `checkoutForValidation` / `restoreBranch` / `checkoutFeatureBranch` を廃止し、worktree ベースに移行
- `verification-execution`: per-step temp worktree 廃止、job worktree で直接実行
- `verification-propagation`: temp worktree 廃止、job worktree から直接 commit + push
- `job-state-schema`: `worktreePath?: string | null` 追加

## Impact

- **src/core/worktree/manager.ts**: 新規。`WorktreeManager` class
- **src/state/schema.ts**: `JobState` に `worktreePath` 追加
- **src/cli/run.ts**: worktree 作成 → `deps.cwd` 差し替え → signal handler 登録
- **src/core/pipeline/run.ts**: `deps.cwd` が worktree path になるだけ。変更不要の可能性あり
- **src/core/step/verification.ts**: per-step temp worktree ロジック除去、job worktree で直接実行
- **src/core/verification/propagate.ts**: temp worktree ロジック除去、job worktree から直接操作
- **src/core/finish/preflight.ts**: `checkoutForValidation` / `restoreBranch` 削除
- **src/core/finish/orchestrator.ts**: `checkoutFeatureBranch` 削除、worktree path 経由の操作に変更
- **テストファイル**: worktree mock の追加、temp worktree 関連テストの書き換え
