# Tasks: local の setupWorkspace を WorktreeMaterializationPlan / materializeWorktree へ集約する

## T-01: `WorktreeMaterializationPlan` DU を新設する

新ファイル `src/core/runtime/workspace-materializer.ts` を作成し、5 アームに対応する識別合併型を定義する。

- [ ] `src/core/runtime/workspace-materializer.ts` を新規作成する。
- [ ] 以下の DU を export する:
  ```typescript
  export type WorktreeMaterializationPlan =
    | { kind: "no-worktree" }
    | { kind: "resume-existing"; worktreePath: string }
    | { kind: "resume-recreated"; remoteBaseRef: string }
    | { kind: "resume-without-recorded-worktree"; remoteBaseRef: string }
    | { kind: "new-run"; remoteBaseRef: string; branchName?: string };
  ```
- [ ] ファイル先頭に JSDoc コメントを付ける（型の目的・各 variant の対応するアームを記述）。
- [ ] 他の export は含めない（型定義のみのファイル）。

**Acceptance Criteria**:
- `src/core/runtime/workspace-materializer.ts` が存在し、`WorktreeMaterializationPlan` がコンパイルエラーなく export されている。
- 5 variant すべてが定義されており、各 variant 名が `setupWorkspace` の 5 アームと 1 対 1 に対応している。

---

## T-02: `materializeWorktree` private method を `LocalRuntime` に追加する

`local.ts` に `private async materializeWorktree(...)` を追加し、各アームの「実体化＋registration」ロジックを集約する。

- [ ] `local.ts` の import に `WorktreeMaterializationPlan` を追加する（`./workspace-materializer.js` から）。
- [ ] `materializeWorktree` の実装を以下のシグネチャで追加する:
  ```typescript
  private async materializeWorktree(
    slug: string,
    jobId: string,
    plan: WorktreeMaterializationPlan,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext>
  ```
- [ ] `switch (plan.kind)` で 5 arm を処理する。各 arm の責務:
  - `no-worktree`: `setupWorkspaceNoWorktree(slug, jobId, opts)` を呼んで返す（既存 private method に委譲）。
  - `resume-existing`:
    - `workspace = { cwd: plan.worktreePath, worktreePath: plan.worktreePath }` を作成。
    - `this.workspace = workspace` をセット。
    - `writeLivenessSidecar(slug, jobId, plan.worktreePath)` を呼ぶ。
    - `recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn)` を呼ぶ。
    - workspace を返す。
  - `resume-recreated` / `resume-without-recorded-worktree`:
    - `this.resolveSetupPlan()` を呼ぶ。
    - `this.manager.create(this.cwd, slug, jobId, plan.remoteBaseRef, undefined, setupPlan)` で worktree を作成。
    - `workspace = { cwd: newWorktreePath, worktreePath: newWorktreePath }` を作成。
    - `this.workspace = workspace` をセット。
    - `opts?.bootstrapState` があれば `JobStateStore(...).persist(opts.bootstrapState)` を呼ぶ。
    - `updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }), slugOpts)` を呼ぶ。
    - `writeLivenessSidecar(slug, jobId, newWorktreePath)` を呼ぶ。
    - `recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn)` を呼ぶ。
    - workspace を返す。
  - `new-run`:
    - `this.resolveSetupPlan()` を呼ぶ。
    - `this.manager.create(this.cwd, slug, jobId, plan.remoteBaseRef, plan.branchName, setupPlan)` で worktree を作成。
    - `workspaceCtx = { cwd: worktreePath, worktreePath, branch: plan.branchName }` を作成。
    - `this.workspace = workspaceCtx` をセット。
    - `opts?.bootstrapState` があれば `JobStateStore(...).persist(opts.bootstrapState)` を呼ぶ。
    - `updateJobState(jobId, (s) => ({ ...s, worktreePath }), slugOpts)` を呼ぶ。
    - `writeLivenessSidecar(slug, jobId, worktreePath)` を呼ぶ。
    - `opts?.requestFilePath` があれば既存の copy / git add / usage / rules / state update / commit ロジック（現在 `setupWorkspace` の `:552-596` 相当）をそのまま移植する。
    - `plan.branchName` があれば `updateJobState(jobId, (s) => ({ ...s, branch: plan.branchName }), slugOpts)` を呼ぶ。
    - workspaceCtx を返す。
- [ ] `resume-recreated` と `resume-without-recorded-worktree` の処理を共通化してよいが、DU の variant は分けて残す（将来の差分追加のため）。
- [ ] 既存の `writeLivenessSidecar` / `updateJobState` / `recopyDraftToChangeFolder` などのヘルパー呼び出し順序を変えない。

**Acceptance Criteria**:
- `materializeWorktree` が `LocalRuntime` の private method として存在する。
- `switch (plan.kind)` のすべての case に対して処理が実装されており、TypeScript の exhaustiveness が満たされている（`default` で `never` assertion、または全 case が網羅されている）。
- 各 arm の「実体化＋registration」の実行順序が既存コードと一致している。

---

## T-03: `setupWorkspace` を plan 決定 + `materializeWorktree` 委譲に薄くする

`setupWorkspace` から個々の arm の実体化ロジックを取り除き、plan 決定と `materializeWorktree` 呼び出しのみにする。

- [ ] `setupWorkspace` の本体を以下の構造に書き換える:
  1. `this.currentSlug = slug`（既存）
  2. transport auth pre-warm（既存）
  3. `baseBranch`, `remoteBaseRef`, `existingWorktreePath` を計算（既存）
  4. `WorktreeMaterializationPlan` の決定:
     - `opts?.noWorktree === true` → `{ kind: "no-worktree" }`
     - `existingWorktreePath !== undefined && existingWorktreePath !== null`:
       - disk 上に存在するか `fs.access` でチェック（既存ロジック）
       - 存在する → `{ kind: "resume-existing", worktreePath: existingWorktreePath }`
       - 存在しない → `{ kind: "resume-recreated", remoteBaseRef }`
     - `existingWorktreePath === null` → `{ kind: "resume-without-recorded-worktree", remoteBaseRef }`
     - それ以外（`existingWorktreePath === undefined`、new-run パス）:
       - `git fetch origin`（既存）
       - behind / ahead 警告（既存）
       - `{ kind: "new-run", remoteBaseRef, branchName: opts?.branchName }`
  5. `return this.materializeWorktree(slug, jobId, plan, opts)`
- [ ] `setupWorkspace` から移植済みロジック（実体化＋registration）を削除する。
- [ ] `setupWorkspaceNoWorktree` は削除しない（`materializeWorktree` の `no-worktree` arm から参照される）。

**Acceptance Criteria**:
- `setupWorkspace` の実装が「plan 決定 + `materializeWorktree` 呼び出し」のみになっており、`WorkspaceContext` の組立・`this.workspace` セット・bootstrap seed・`updateJobState`・liveness sidecar・recopy の各ロジックが本メソッド内に存在しない。
- `setupWorkspaceNoWorktree` が削除されずに残っている。
- 既存コードの振る舞いが変わらない（5 アームの判定条件・実行内容が同等である）。

---

## T-04: typecheck && test を green で通す

- [ ] `bun run typecheck` が 0 exit で完了する。
- [ ] `bun run test` が 0 exit で完了する（既存テストの期待値書き換えは行わない; import / mock path の機械的更新は許容）。
- [ ] T-01〜T-03 で変更したファイル以外に src/ 配下のファイルを変更していない（スコープ遵守）。

**Acceptance Criteria**:
- `bun run typecheck` が green。
- `bun run test` が green。
- `git diff --name-only` に `src/core/runtime/workspace-materializer.ts`（新規）と `src/core/runtime/local.ts`（変更）以外の src/ ファイルが含まれない。
