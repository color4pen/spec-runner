## 1. WorktreeManager に branchName パラメータを追加

- [x] 1.1 `src/core/worktree/manager.ts` の `WorktreeManager` interface の `create()` に `branchName?: string` パラメータを追加する
- [x] 1.2 `createWorktreeManager()` の `create()` 実装で、`branchName` が指定された場合は `git worktree add -b <branchName> <path> <ref>` を使い、省略時は従来通り `--detach` を使う
- [x] 1.3 `tests/core/worktree/manager.test.ts` に branchName 指定時のテストケースを追加する（`-b` フラグが spawn に渡されることを検証）
- [x] 1.4 branchName 省略時の既存テストが引き続き green であることを確認する

## 2. LocalRuntime.setupWorkspace() で branch 作成 + request.md commit

- [x] 2.1 `src/core/runtime/local.ts` の `setupWorkspace()` run パスで、`manager.create()` に branchName を渡す。branchName は `getBranchPrefix(request.type) + slug + "-" + jobId.slice(0, 8)` で計算する（`WorkspaceOptions` に `branchName?: string` と `requestType?: string` を追加するか、引数で受け取る）
- [x] 2.2 `setupWorkspace()` run パスで、request.md の `git add` 後に `git commit -m "add request.md for <slug>"` を実行する
- [x] 2.3 `setupWorkspace()` run パスで、commit 後に `jobState.branch` を `updateJobState()` で記録する（worktreePath と同時に）
- [x] 2.4 resume パスでは branchName を渡さないことを確認する（既存 worktree 再利用 / 再作成のどちらでも `--detach` のまま）
- [x] 2.5 `tests/unit/core/runtime/local.test.ts` に run パスで branchName + commit が実行されるテストケースを追加する

## 3. ManagedRuntime.setupWorkspace() に git 操作を追加

- [x] 3.1 `src/core/runtime/managed.ts` の `setupWorkspace()` を no-op から `git checkout -b <branchName>` + `git push origin <branchName>` に変更する（branchName は `getBranchPrefix(request.type) + slug + "-" + jobId.slice(0, 8)` で計算）
- [x] 3.2 request.md のコピー + `git add` + `git commit -m "add request.md for <slug>"` + `git push origin <branchName>` を実行する
- [x] 3.3 branchName が省略された場合（resume パス等）は従来通り no-op を維持する
- [x] 3.4 `ManagedRuntime` constructor の deps に `SpawnFn` を追加する（testability のため）

## 4. CommandRunner で branch を in-memory state に反映

- [x] 4.1 `src/core/command/runner.ts` の `execute()` で、`setupWorkspace()` 完了後に `jobState.branch` を state store から再読み込みするか、setupWorkspace の戻り値に branch を含める（`WorkspaceContext` に `branch?: string` を追加）
- [x] 4.2 in-memory の `jobState.branch` に反映する（`worktreePath` と同様のパターン）

## 5. propose prompt から branch 作成指示と register_branch 指示を削除

- [x] 5.1 `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` から `register_branch` tool の呼び出し指示（完了条件の項目 4）を削除する
- [x] 5.2 `PROPOSE_SYSTEM_PROMPT` の role 説明から「4. `register_branch` tool を呼んで branch 名を CLI に登録する」を削除する
- [x] 5.3 `PROPOSE_SYSTEM_PROMPT` の禁止事項から「change folder を作らずに register_branch だけ呼んで end_turn すること」を削除する
- [x] 5.4 `PROPOSE_SYSTEM_PROMPT` の「Workspace の前提」セクションに「branch は CLI が作成済みで、agent はそのまま使う」旨を明記する
- [x] 5.5 `PROPOSE_INITIAL_MESSAGE_TEMPLATE` から `register_branch` tool の呼び出し指示を削除する
- [x] 5.6 `ProposeStep.buildMessage()` を `state.branch` から branch 名を取得する形に変更する（現在は `getBranchPrefix + slug + jobId` で再計算している）

## 6. ClaudeCodeRunner の buildAdditionalInstructions 更新

- [x] 6.1 `src/adapter/claude-code/agent-runner.ts` の `buildAdditionalInstructions()` から `If the branch does not exist yet, create it: git checkout -b ${branch}` を削除する（branch は CLI が作成済み）
- [x] 6.2 propose 向けの `create the branch ${branch}, make the initial commit` 指示を削除する（branch 作成は CLI の責務）
- [x] 6.3 propose 向けの `Do NOT call register_branch` 指示を削除する（tool 自体がなくなるため不要）

## 7. register_branch tool の削除

- [x] 7.1 `src/adapter/managed-agent/tools/register-branch.ts` を削除する
- [x] 7.2 managed agent の toolset（`ManagedAgentRunner.runProposeStyle()` 内）から `register_branch` tool の注入コードを削除する
- [x] 7.3 SSE dispatch table から `register_branch` のエントリを削除する（`onBranchRegistered` callback 含む）
- [x] 7.4 `ManagedAgentRunner.runProposeStyle()` の return 値から `agentBranch` を削除する（branch は state.branch から取得済み）
- [x] 7.5 `tests/register-branch-schema.test.ts` を削除する
- [x] 7.6 codebase を `register_branch` / `registerBranchTool` / `onBranchRegistered` で grep し、残存参照がないことを確認する

## 8. WorkspaceOptions / RuntimeStrategy の型更新

- [x] 8.1 `src/core/runtime/strategy.ts` の `WorkspaceOptions` に `branchName?: string` を追加する
- [x] 8.2 `WorkspaceContext` に `branch?: string` を追加する（setupWorkspace の戻り値で branch 名を返せるようにする）
- [x] 8.3 `PipelineRunCommand.prepare()` で `WorkspaceOptions.branchName` を計算して渡す

## 9. テスト・型チェック・検証

- [x] 9.1 `bun run typecheck` が green であることを確認する
- [x] 9.2 `bun run test` が green であることを確認する
- [x] 9.3 既存の propose 関連テスト（ProposeStep.buildMessage の branch 計算テスト等）を更新する
