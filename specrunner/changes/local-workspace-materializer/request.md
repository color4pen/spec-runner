# local の setupWorkspace を WorktreeMaterializationPlan / materializeWorktree へ集約する（挙動不変）

## Meta

- **type**: refactoring
- **slug**: local-workspace-materializer
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

execution-ownership ADR 周辺の構造整理（所有権不変の抽出）。`LocalRuntime.setupWorkspace()` の 4-5 アームに「worktree を実体化して runtime へ登録する」所作が複製されている。DU plan ＋ materializer に集約する。挙動は変えない。

## 現状コードの前提

- `src/core/runtime/local.ts:397-605` `setupWorkspace()` に 5 アーム:
  - **no-worktree**（`:409` `opts.noWorktree` → `setupWorkspaceNoWorktree`）
  - **resume: existingWorktreePath がディスク上に存在** → 再利用（`:427-438`）
  - **resume: existingWorktreePath 削除済** → 再作成（`:439-458`）
  - **resume: existingWorktreePath === null** → 作成（`:461-480`）
  - **run-path**: fetch → 新規 worktree 作成（`:482-604`）
- 各アームで `manager.create` → `WorkspaceContext` 組立 → `this.workspace` 設定 → bootstrap seed → `updateJobState` → `writeLivenessSidecar` → recopy/copy が複製されている。

## 要件

1. **`WorktreeMaterializationPlan`（DU）** を新設: `new-run | resume-existing | resume-recreated | resume-without-recorded-worktree | no-worktree`（実アームに一致）。
2. **`materializeWorktree(plan)`** を新設し、複製された「実体化＋registration（`this.workspace` 設定 / bootstrap seed / `updateJobState` / liveness sidecar / recopy）」を一つにする。
3. `setupWorkspace` は「plan を決める → `materializeWorktree` に渡す」に寄せる。

## スコープ外（越えたら別 request）

- worktree 作成 / 再利用の判定結果を変えない
- fetch / base branch sync の挙動を変えない
- seed / bootstrap / liveness / recopy の順序を変えない
- request.md copy / commit の挙動を変えない

## 受け入れ基準

- [ ] `WorktreeMaterializationPlan`（DU）＋ `materializeWorktree` が抽出される。
- [ ] **既存テストの期待振る舞いを書き換えない**（挙動不変）。機械的更新（import / mock path）は許容。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- boolean flag の集積でなく DU plan で分岐を型に表す。
- 挙動不変の構造抽出のみ。`LocalRuntime` の 4 分割（Manager/Bootstrapper/Inspector/Cleanup）までは本 request でやらず、materializer に絞る。
