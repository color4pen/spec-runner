# LocalRuntime.materializeWorktree の worktree 実体化 / 登録 / liveness を WorkspaceMaterializer へ抽出する（挙動不変）

## Meta

- **type**: refactoring
- **slug**: workspace-materializer-extract
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`src/core/runtime/workspace-materializer.ts` は現状 `WorktreeMaterializationPlan`（判別共用体）を定義するだけの stub。plan の実体化ロジック `materializeWorktree` は `LocalRuntime`（`src/core/runtime/local.ts`）側にあり、worktree の create / recreate / registration（`this.workspace` 設定・bootstrap seed・`updateJobState`）/ liveness sidecar / recopy / request.md stage+commit を一手に持つ。この実体化を module 側へ移し、`LocalRuntime` は plan 解決と materializer への委譲に徹する。所有権を実際に移す構造分割であり、挙動は変えない。

## 現状コードの前提

- `src/core/runtime/local.ts` `setupWorkspace()` が plan を解決し、末尾で `return this.materializeWorktree(slug, jobId, plan, opts)`（`local.ts:483`）。
- `src/core/runtime/local.ts:493-627` `materializeWorktree(slug, jobId, plan, opts)` は 4 実アーム（`no-worktree` は `setupWorkspaceNoWorktree` へ委譲）:
  - **resume-existing**: `this.workspace =` → `writeLivenessSidecar` → `recopyDraftToChangeFolder`。
  - **resume-recreated / resume-without-recorded-worktree**: `this.manager.create` → `this.workspace =` → seed（`JobStateStore.persist`）→ `updateJobState` → `writeLivenessSidecar` → `recopyDraftToChangeFolder`。
  - **new-run**: `this.manager.create` → `this.workspace =` → seed → `updateJobState` → `writeLivenessSidecar` → request.md copy/stage/commit（失敗時 `this.manager.remove`+`prune` cleanup → throw）→ branch 記録。
- `this.manager.create` は `materializeWorktree` 内の 2 箇所（`local.ts:521`, `local.ts:544`）にのみ現れる。
- 保持すべき順序不変:
  - `this.workspace` は `updateJobState` より**前**に設定（`updateJobState` が slug store opts で workspace を読むため。`local.ts:548` のコメント参照）。
  - seed（bootstrapState の persist）は `updateJobState` より**前**（T-02）。
  - request.md stage/commit 失敗時は worktree を `remove`+`prune` してから throw。

## 要件

1. `WorkspaceMaterializer` を `workspace-materializer.ts` に新設し、`materializeWorktree` の実体化ロジック（`manager.create` / registration / seed / `updateJobState` / liveness sidecar / recopy / request.md stage+commit / 失敗時 cleanup）を移す。
2. `LocalRuntime` が materializer に渡す **host seam** を狭い interface として定義する。materializer が必要とする能力（`manager`・`spawnFn`・`resolveSetupPlan`・`updateJobState`・liveness 書き込み・`this.workspace` の登録・root cwd）だけを注入し、materializer は host 経由で副作用を行う。materializer 内部で上記の順序不変（workspace-before-updateJobState / seed-before-updateJobState / 失敗時 remove+prune）を保持する。
3. `LocalRuntime.materializeWorktree` は「plan を materializer に渡して委譲する」形に縮退する。worktree の create / recreate / registration / liveness を担う `manager.create` 呼び出しは `local.ts` から消え、`workspace-materializer.ts` に存在する。

## スコープ外（越えたら別 request）

- plan 解決（どのアームを選ぶか）の判定を変えない。
- fetch / base branch sync の挙動を変えない。
- seed / liveness / recopy / stage / commit の順序・内容を変えない。
- `LocalRuntime` の Manager/Bootstrapper/Inspector/Cleanup 4 分割はやらない（materializer 抽出に絞る）。
- `architecture/` には触れない。

## 受け入れ基準（機械検証可能な構造 gate を必須）

- [ ] **構造 gate test（新規・必須）**: `local.ts` のソースに `manager.create(` が 0 件、`workspace-materializer.ts` のソースに `manager.create(`（worktree 生成）と registration/liveness の実体が存在することを grep で検査する test を追加し green にする。行移動だけで typecheck+test が緑になる失敗類型を、この構造 assertion で塞ぐ。
- [ ] 既存テストの期待振る舞いを書き換えない（挙動不変）。機械的更新（import / mock path）は許容。
- [ ] `typecheck && test` が green。
- [ ] 順序不変（workspace-before-updateJobState / seed-before-updateJobState / 失敗時 remove+prune）が抽出後も保持されている。

## 設計判断（drift 抑止）

- host seam は「materializer が `LocalRuntime` の state 変異能力を**狭い interface 経由で受ける**」形にする。materializer と `LocalRuntime` internals を双方向結合させない。materializer が `WorkspaceContext` を確定し host に登録させる／host の setter を順序込みで呼ぶ、いずれでも順序不変は materializer 内部で保証する。
- boolean flag ではなく既存の `WorktreeMaterializationPlan`（DU）で分岐する現状を維持する。
