## Why

branch 作成と request.md の初期 commit が agent の責務になっている。これにより 3 つの failure mode が発生する: (1) propose が commit 前に失敗すると request.md が untracked のまま残り finish が失敗する、(2) detached HEAD で agent が起動するため branch checkout し忘れで失敗する、(3) branch 名の CLI → agent → CLI 往復が不要な複雑さを生む。branch 作成と request.md commit を CLI に統一すれば、agent は既存 branch 上で作業するだけになり、これらの failure mode が構造的に解消される。

## What Changes

- `WorktreeManager.create()` に `branchName?: string` 引数を追加し、`--detach` の代わりに `-b <branchName>` で worktree を作成する
- `LocalRuntime.setupWorkspace()` の run パスで、branch 付き worktree 作成 + request.md の commit を実行する
- `ManagedRuntime.setupWorkspace()` で `git checkout -b <branchName> && git push origin <branchName>` + request.md commit を実行する
- `setupWorkspace()` 完了時点で `jobState.branch` を記録する（propose 完了前に branch 名が確定）
- `PROPOSE_SYSTEM_PROMPT` と `PROPOSE_INITIAL_MESSAGE_TEMPLATE` から branch 作成指示と `register_branch` 呼び出し指示を削除する
- `src/adapter/managed-agent/tools/register-branch.ts` を削除し、managed agent の toolset から除外する
- `ClaudeCodeRunner.buildAdditionalInstructions()` の propose 向け branch 作成指示を削除する

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

- `register-branch-tool`: tool 自体を廃止する。全 Requirement を REMOVED にする
- `propose-session`: agent configuration から `register_branch` Custom Tool を除外し、branch/slug が CLI 由来であることを反映する
- `propose-pipeline`: 状態マシンから `register-branch-received` を除去し、branch は CLI が事前設定する形に変更。`BRANCH_NOT_REGISTERED` エラーパスを削除
- `step-execution-architecture`: `Custom Tool Spec and Handler Co-located With Step` から register_branch 言及を除去。`setsBranch` の主経路を CLI 事前設定に変更

## Impact

- **コード**: `src/core/worktree/manager.ts`、`src/core/runtime/local.ts`、`src/core/runtime/managed.ts`、`src/prompts/propose-system.ts`、`src/adapter/claude-code/agent-runner.ts`、`src/core/step/propose.ts`、`src/core/step/executor.ts`、`src/core/command/runner.ts` に変更。`src/adapter/managed-agent/tools/register-branch.ts` を削除
- **テスト**: WorktreeManager / LocalRuntime / ManagedRuntime / propose prompt のテスト更新。register-branch 関連テストの削除
- **動作変更**: propose agent は branch を作成しなくなり、既存 branch 上で change folder の commit のみ行う。finish の git mv は request.md が確実に branch に存在するため安定する
- **後方互換**: managed runtime の register_branch tool 削除は breaking change（managed agent が tool を呼べなくなる）。ただし managed runtime は現在 dogfooding 専用であり外部消費者はいない
