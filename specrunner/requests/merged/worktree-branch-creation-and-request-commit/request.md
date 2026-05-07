# branch 作成を CLI の責務に統一し、request.md を初期 commit する

## Meta

- **type**: spec-change
- **slug**: worktree-branch-creation-and-request-commit

## 背景

現在は propose agent が branch を作成・commit・push し、managed runtime では `register_branch` custom tool で CLI に branch 名を通知する。この設計に以下の問題がある：

1. **request.md が feature branch に含まれないケース**: propose が commit する前に失敗すると request.md が untracked のまま残り、finish の `git mv` が「source directory is empty」で失敗する（PR #116 の finish で発生）

2. **branch が存在しない状態で agent が動く**: detached HEAD で agent が起動するため、agent が branch を checkout し忘れると「Branch does not exist after agent run」で失敗する（PR #116 の implementer で発生）

3. **branch 名の責務が分散**: branch 名は CLI が `${prefix}${slug}-${jobId.slice(0,8)}` で決定するが、propose agent にも branch 名を渡して agent 側で `git checkout -b` させ、managed では `register_branch` custom tool で CLI に通知し返す。CLI → agent → CLI の往復が不要な複雑さを生んでいる

4. **register_branch custom tool が branch 名通知のためだけに存在する**: CLI が branch を事前に作成すれば CLI は既に branch 名を知っているので、agent → CLI の通知は不要

## 要件

### 1. branch 作成を CLI に統一（local / managed 共通）

CLI が branch を事前に作成し、agent は既存 branch 上で作業する。local も managed も同じモデル。

1. branch 名は CLI が `getBranchPrefix(request.type) + slug + "-" + jobId.slice(0, 8)` で決定する（現状通り）
2. **local runtime**: `WorktreeManager.create()` に `branchName?: string` 引数を追加し、`git worktree add -b <branchName> <path> <baseRef>` で branch 付き worktree を作成する
3. **managed runtime**: `ManagedRuntime.setupWorkspace()` で `git checkout -b <branchName> && git push origin <branchName>` を実行し、remote に branch を作成する。managed agent はこの既存 branch 上で作業する
4. branchName が省略された場合は従来通り `--detach`（local）/ no-op（managed）で後方互換を維持
5. resume パスでは branch 作成しない（既存 branch を再利用）

### 2. request.md を初期 commit する

6. `LocalRuntime.setupWorkspace()` の run パスで、request.md コピー + git add + `git commit -m "add request.md for <slug>"` を実行する
7. `ManagedRuntime.setupWorkspace()` でも同様に request.md を commit + push する（managed agent がアクセスできるようにする）
8. propose agent は以降の commit で change folder を追加する（request.md は既に branch に存在）

### 3. propose prompt の調整

共有 template から branch 作成指示と register_branch 指示を削除できる。

9. `PROPOSE_SYSTEM_PROMPT` と `PROPOSE_INITIAL_MESSAGE_TEMPLATE` から「branch を作成せよ」の指示を削除する（branch は CLI が作成済み）
10. `PROPOSE_INITIAL_MESSAGE_TEMPLATE` から `register_branch` tool の呼び出し指示を削除する
11. `buildInitialMessage` に渡す branch 名は `state.branch` から取得する（setupWorkspace 時点で確定済み）

### 4. register_branch tool の廃止

12. `src/adapter/managed-agent/tools/register-branch.ts` を削除する
13. managed agent の toolset から register_branch を除外する
14. `ClaudeCodeRunner.buildAdditionalInstructions()` の「Do NOT call register_branch」指示を削除する（tool 自体がなくなるため不要）
15. executor の `setsBranch` フラグ: branch は setupWorkspace 時点で state に記録済みなので、executor の `setsBranch` フォールバック（`if (!state.branch)` ガード）は発動しない。既存ロジックの変更は不要

### 5. state への branch 早期記録

16. `setupWorkspace()` で branch 名を確定した時点で `jobState.branch` に記録する（現在は propose 完了後に記録）
17. これにより propose が失敗しても branch 名が state に残り、resume で利用可能

## スコープ外

- finish のロジック変更（request.md が branch に入ることで自然に解決）
- `agentBranch` の結果検証ロジックの変更（executor が agent 結果から branch を取得する既存ロジックは残す。state.branch が既に設定されていれば上書きしない）

## 受け入れ基準

- [ ] local: worktree 作成時に branch が切られている（detached HEAD ではない）
- [ ] managed: setupWorkspace で remote に branch が作成されている
- [ ] request.md が feature branch の最初の commit に含まれている（local / managed 共通）
- [ ] propose agent が branch を新規作成しない（local / managed 共通）
- [ ] `register_branch` tool が削除されている
- [ ] propose prompt に branch 作成指示と register_branch 指示がない
- [ ] finish の git mv が request.md を正常に移動できる
- [ ] `jobState.branch` が propose 実行前に記録されている
- [ ] resume パスでは従来通り動作する
- [ ] `bun run typecheck && bun run test` が green
