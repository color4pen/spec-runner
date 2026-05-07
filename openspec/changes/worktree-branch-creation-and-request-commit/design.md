## Context

現状の branch ライフサイクル:

1. CLI が `setupWorkspace()` で **detached HEAD** の worktree を作成（local）、または cwd をそのまま返す（managed）
2. propose agent が branch を `git checkout -b` で作成し、change folder を commit + push する
3. managed runtime では agent が `register_branch` custom tool で branch 名を CLI に通知する
4. CLI が `state.branch` に記録する（propose 完了後）

この設計は 3 つの failure mode を持つ（PR #116 で全発生）:
- request.md が feature branch に commit される保証がない（agent が失敗すると untracked のまま）
- detached HEAD で agent が起動するため branch checkout 忘れで失敗する
- branch 名の CLI → agent → CLI 往復が不要な複雑さを生む

現状のコード構造:
- `WorktreeManager.create()`: `git worktree add --detach <path> <ref>` で detached HEAD
- `LocalRuntime.setupWorkspace()`: worktree 作成 + request.md コピー + staging（commit なし）
- `ManagedRuntime.setupWorkspace()`: no-op（cwd 返却のみ）
- `ProposeStep.buildMessage()`: `getBranchPrefix(type) + slug + "-" + jobId.slice(0,8)` で branch 名を計算して prompt に注入
- `executor.ts`: `setsBranch` フラグで propose 完了後に `state.branch` を設定
- `register-branch.ts`: managed agent 用の custom tool（branch 名通知）

## Goals / Non-Goals

**Goals:**

- branch 作成を CLI（`setupWorkspace()`）に統一し、agent は既存 branch 上で作業するだけにする
- request.md を feature branch の最初の commit として確実に含める
- `register_branch` custom tool を廃止して managed/local の branch ライフサイクルを単純化する
- `jobState.branch` を propose 実行前に確定させ、resume パスでの信頼性を上げる

**Non-Goals:**

- finish のロジック変更（request.md が branch に入ることで自然に解決）
- executor の `agentBranch` 結果検証ロジックの変更（`state.branch` が既に設定されていれば上書きしない既存ガード）
- resume パスの挙動変更（既存 branch を再利用する既存ロジックを維持）

## Decisions

### D1. WorktreeManager.create() に branchName パラメータを追加

**Decision**: `create(repoRoot, slug, jobId, baseRef?, branchName?)` に optional な `branchName` を追加。指定時は `git worktree add -b <branchName> <path> <ref>` を使い、省略時は従来通り `--detach`。

**Rationale**: worktree 作成と branch 作成を 1 コマンドで行える git の機能をそのまま使う。detached HEAD の中間状態が発生しない。branchName 省略時の後方互換により resume パスへの影響もない。

**Alternatives considered**:
- A. worktree は detached のまま作り、setupWorkspace 内で `git checkout -b` を別途実行 → 中間状態が残り、bun install 中に branch がない状態が発生
- B. branchName を必須にする → resume パス（既存 worktree 再利用）で不要なため optional が適切

### D2. setupWorkspace() で request.md を commit する

**Decision**: `LocalRuntime.setupWorkspace()` の run パスで、request.md コピー後に `git add + git commit -m "add request.md for <slug>"` を実行する。`ManagedRuntime.setupWorkspace()` でも同様に commit + push する。

**Rationale**: request.md が branch の最初の commit に含まれることで、propose agent が失敗しても request.md は branch に存在する。finish の `git mv` が「source directory is empty」で失敗するケースを構造的に解消。

**Alternatives considered**:
- A. propose agent に request.md の commit を任せる（現状）→ agent 失敗時に request.md が untracked のまま残る
- B. CLI が commit せず staging のみ（現状の local）→ agent が commit するまで request.md は branch に入らない

### D3. setupWorkspace() で jobState.branch を早期記録する

**Decision**: `setupWorkspace()` で branch 名を確定した時点で `jobState.branch` に記録する。CommandRunner は setupWorkspace 完了後に in-memory の jobState にも反映する。

**Rationale**: propose が失敗しても branch 名が state に残り、resume で利用可能。現状は propose 完了後（executor の setsBranch / agentBranch 経路）に初めて記録されるため、propose 失敗時に branch 名が失われる。

### D4. register_branch custom tool を廃止する

**Decision**: `src/adapter/managed-agent/tools/register-branch.ts` を削除する。managed agent の toolset から除外する。

**Rationale**: CLI が branch を事前に作成すれば、agent → CLI の branch 名通知は不要。tool の存在理由が消滅する。

**Impact**: `propose-pipeline` spec の `BRANCH_NOT_REGISTERED` エラーパスも不要になる。`propose-session` spec の custom_tools 配列から register_branch を除外する。

### D5. propose prompt の簡素化

**Decision**: `PROPOSE_SYSTEM_PROMPT` の完了条件から `register_branch tool が CLI 提供の branch 名で 1 回呼ばれている` を削除する。`PROPOSE_INITIAL_MESSAGE_TEMPLATE` から `register_branch` tool の呼び出し指示を削除する。`buildAdditionalInstructions()` の propose 向け branch 作成指示も削除する。

**Rationale**: agent は既存 branch 上で作業するだけなので、branch 作成指示と register_branch 指示は不要。prompt が短くなり agent のタスクが明確になる。

### D6. ManagedRuntime.setupWorkspace() に git 操作を追加

**Decision**: `ManagedRuntime.setupWorkspace()` を no-op から `git checkout -b <branchName> && git push origin <branchName>` + request.md commit + push に変更する。

**Rationale**: managed agent も CLI が作成した branch 上で作業する統一モデル。remote に branch を push しておくことで、managed agent がアクセスできる。

**Trade-off**: managed runtime の setupWorkspace が no-op でなくなり、git 依存が生まれる。ただし managed 環境にも git は存在するため実用上の問題はない。

## Risks / Trade-offs

- **[Risk] managed 環境での git 操作失敗** → managed runtime の `setupWorkspace()` が `git checkout -b` + `git push` を実行するため、git 権限や remote 設定の問題で失敗する可能性がある。Mitigation: エラーメッセージに具体的な操作と原因を含める
- **[Risk] resume パスでの branch 重複作成** → resume 時に `setupWorkspace()` が再度 branch を作成しようとすると失敗する。Mitigation: resume パスでは branchName を渡さない（既存 worktree を再利用する既存ロジックを維持）
- **[Trade-off] register_branch 廃止は managed agent の breaking change** → managed agent が tool を呼べなくなるが、managed runtime は dogfooding 専用であり外部消費者はいない。破壊的だが影響範囲は限定的
- **[Trade-off] setupWorkspace() の責務増大** → request.md commit + branch 記録が加わるが、「workspace を使える状態にする」責務の自然な延長
