# Tasks: `--no-worktree` 実行モード

## T-01: state schema に portable な `noWorktree` フィールドを追加する

- [x] `src/state/schema.ts` の `JobState` に optional `noWorktree?: boolean` を追加する（用途コメント付き: no-worktree モードで実行された job の判別フラグ。machine-local ではなく portable）。
- [x] `validateJobState` では必須化せず、absent を許容する（後方互換: 既存 state は `undefined` = worktree モード扱い）。
- [x] `src/store/job-state-store.ts` の `stateToStateJson` の slug-mode strip 対象（`worktreePath` / `pid` / `session`）に `noWorktree` を**含めない**ことを確認する（= slug-mode でも state.json に書き出される）。

**Acceptance Criteria**:
- `noWorktree` を含む JobState が型エラーなくビルドできる。
- slug-mode で persist した state.json に `noWorktree: true` が残る（strip されない）。
- `noWorktree` 欠如の既存 state が `validateJobState` を通り、`noWorktree === undefined` になる。
- `bun run typecheck` が green。

## T-02: `WORKTREE_DIRTY` エラーコードと factory を追加する

- [x] `src/errors.ts` の `ERROR_CODES` に `WORKTREE_DIRTY: "WORKTREE_DIRTY"` を追加する。
- [x] factory `worktreeDirtyError(detail: string): SpecRunnerError` を追加する（hint: `--no-worktree` は clean な working tree を要求する旨、commit / stash を案内）。
- [x] exit code は `EXIT_CODE_MAP` の既定（GENERAL_ERROR = 1）に委ねる（setupWorkspace 失敗経路は CommandRunner が exit 1 に正規化する）。

**Acceptance Criteria**:
- `worktreeDirtyError(...)` が `SpecRunnerError`（code = `WORKTREE_DIRTY`）を返す。
- `bun run typecheck` が green。

## T-03: port 型に `noWorktree` を追加する

- [x] `src/core/port/runtime-strategy.ts` の `WorkspaceOptions` に `noWorktree?: boolean` を追加する（doc コメント: 真のとき worktree を作らず cwd を返す）。
- [x] 同ファイルの `WorkspaceContext` に `noWorktree?: boolean` を追加する（doc コメント: no-worktree モードで解決された workspace であることを示す）。

**Acceptance Criteria**:
- 型追加で既存実装（LocalRuntime / ManagedRuntime）がビルドを壊さない（optional のため）。
- `bun run typecheck` が green。

## T-04: `LocalRuntime.setupWorkspace` に no-worktree 分岐を追加する

- [x] `src/core/runtime/local.ts` の `setupWorkspace` 冒頭（`this.currentSlug = slug` 設定後、既存の `existingWorktreePath` 分岐より前）に `if (opts?.noWorktree) { return this.setupWorkspaceNoWorktree(slug, jobId, opts); }` を置く。
- [x] private メソッド `setupWorkspaceNoWorktree(slug, jobId, opts)` を実装する:
  - working tree clean 検査: `this.spawnFn("git", ["status", "--porcelain"], { cwd: this.cwd })`。stdout が非空なら `worktreeDirtyError(...)` を throw。
  - run パス判定: `opts.existingWorktreePath === undefined` を run とみなす。
    - run: `git checkout -b <opts.branchName>`（cwd = `this.cwd`）。失敗時は stderr 付きで throw。
    - resume: branch 操作は行わない（feature branch checkout 済み前提）。
  - `const workspace: WorkspaceContext = { cwd: this.cwd, worktreePath: undefined, branch: opts.branchName, noWorktree: true }` を `this.workspace` に設定する。
  - slug store seed: `const slugOpts = { slug, stateRoot: this.cwd }`。`opts.bootstrapState` があれば `new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState)`。
  - sidecar: `await this.writeLivenessSidecar(slug, jobId, null)`（T-05）。
  - run の場合のみ: request.md の change folder コピー・`git add`・draft 削除・rules/usage コピー・`git commit -m "add request.md for <slug>"`・`request.path` / `branch` の state 記録を、既存 run パスと同じロジックで `this.cwd` 上に対して実行する（worktree 版の該当ブロックを cwd 向けに共通化 / 再利用する）。
  - `return workspace`。
- [x] 既存の worktree パス（`opts?.noWorktree` が偽）には一切手を入れない。

**Acceptance Criteria**:
- `--no-worktree` run で worktree が作成されず `git checkout -b <branch>` で feature branch が作られる。
- `--no-worktree` resume で worktree が作成されず cwd がそのまま `workspace.cwd` になる。
- dirty な working tree で `WORKTREE_DIRTY` が throw される。
- worktree モード（フラグ無し）の `setupWorkspace` 挙動が不変。
- `bun run typecheck` が green。

## T-05: sidecar / store 解決を worktreePath 不在に対応させる

- [x] `src/core/runtime/local.ts` の `writeLivenessSidecar` の引数を `worktreePath: string | null` に拡げ、null をそのまま JSON に書く（`{ pid, session: null, worktreePath, jobId }`）。既存呼び出し（worktree パス）は string を渡すので無変更で通る。
- [x] `buildDeps` の `storeFactory`: `const stateRoot = workspace.worktreePath ?? workspace.cwd;` を使い、worktreePath 不在でも throw せず `new JobStateStore(id, this.cwd, { slug, stateRoot })` を返す。
- [x] `slugStoreOpts()`: stateRoot を `this.workspace?.worktreePath ?? this.workspace?.cwd` で算出し、`currentSlug` と stateRoot が揃えば `{ slug, stateRoot }` を返す。
- [x] `registerCleanup` の `cleanupWorktreeOnFailure` が no-worktree（worktreePath = null）で worktree remove/prune を行わないことを確認する（既存の `if (worktreePath)` ガードで自然にスキップ。追加変更不要なら確認のみ）。

**Acceptance Criteria**:
- no-worktree 時、sidecar に `worktreePath: null` が書かれ `pid` / `jobId` は記録される。
- no-worktree 時、`storeFactory` / `slugStoreOpts()` が cwd を stateRoot として解決し throw しない。
- worktree モードの sidecar / store 解決挙動が不変。
- `bun run typecheck` が green。

## T-06: CLI に `--no-worktree` フラグを配線する

- [x] `src/cli/command-registry.ts` の `run` / `job start` / `job resume` の `flags` に `"no-worktree": { type: "boolean" }` を追加する。
- [x] `run` / `job start` handler: `runRun(requestMdPath, { logLevel, json, noWorktree: !!parsed.flags["no-worktree"] })`。
- [x] `job resume` handler: `runResume(parsed.positional!, { ..., noWorktree: !!parsed.flags["no-worktree"] })`。
- [x] `src/cli/run.ts` の `runRunCore` / `runRun` の options 型に `noWorktree?: boolean` を追加し、`PipelineRunCommand` の options まで渡す。
- [x] `src/cli/resume.ts` の `ResumeOptions` に `noWorktree?: boolean` を追加し、`ResumeCommand` まで渡す。

**Acceptance Criteria**:
- `specrunner run --no-worktree <slug>` / `specrunner job start --no-worktree <slug>` / `specrunner resume --no-worktree <slug>` がフラグ解析エラーにならない。
- フラグ未指定時は `noWorktree` が `false` / `undefined` として扱われる。
- `bun run typecheck` が green。

## T-07: `PipelineRunCommand.prepare()` で noWorktree を state と workspaceOpts に乗せる

- [x] `src/core/command/pipeline-run.ts` の `PipelineRunOptions` に `noWorktree?: boolean` を追加する。
- [x] `prepare()` で `bootstrapJob` 後に `jobState.noWorktree = this.options.noWorktree === true ? true : undefined`（true のときのみ設定）を行う。
- [x] 返す `workspaceOpts` に `noWorktree: this.options.noWorktree` を追加する（`bootstrapState: jobState` は同一参照なので noWorktree を含む）。

**Acceptance Criteria**:
- `--no-worktree` run の seed 後 state.json に `noWorktree: true` が残る。
- フラグ無し run の state.json に `noWorktree` が現れない（または undefined）。
- `bun run typecheck` が green。

## T-08: `ResumeCommand.prepare()` を no-worktree 対応にする

- [x] `src/core/command/resume.ts` の `ResumeOptions` に `noWorktree?: boolean` を追加する。
- [x] 返す `workspaceOpts` に `noWorktree: this.options.noWorktree` を追加する。
- [x] no-worktree 時、stale 回復 persist（現 `resolveStateStoreByJobId(cwd, state.jobId)`）と running 遷移 persist を、`new JobStateStore(state.jobId, cwd, { slug, stateRoot: cwd })`（slug は `getJobSlug(state)`）で解決する。worktree モード時は従来の `resolveStateStoreByJobId` を使う（分岐）。
- [x] sidecar path 由来の `isStaleRunning` 判定は現状維持（sidecar 不在 → stale → 回復、の既存挙動で no-worktree CI 再開が成立する）。

**Acceptance Criteria**:
- sidecar 不在の checkout でも no-worktree resume が running 遷移を `specrunner/changes/<slug>/state.json` に永続化できる。
- worktree モードの resume の store 解決経路が不変。
- `bun run typecheck` が green。

## T-09: exit-guard を no-worktree 対応にする

- [x] `src/core/lifecycle/exit-guard.ts` の `createExitGuardHandler(repoRoot, jobId?, opts?)` に `opts?: { noWorktree?: boolean; slug?: string }` を追加する。
- [x] `opts.noWorktree && opts.slug` のとき、`.git/specrunner-worktrees/` 走査（`handlePerJobExit`）をスキップし、新 `handleNoWorktreeExit(repoRoot, jobId, slug)` を呼ぶ。
- [x] `handleNoWorktreeExit`: `new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot })` で load → `status === "running"` のとき `appendInterruption({ type: "interruption", reason: "signal", ts })` + `transitionJob(..., "awaiting-resume", { trigger: "exit-guard", ... })` + persist。すべて best-effort（try-catch でエラーを握り潰す）。
- [x] `src/core/command/runner.ts` の `execute()` の `process.on("beforeExit", createExitGuardHandler(repoRoot, jobState.jobId))` を、`createExitGuardHandler(repoRoot, jobState.jobId, { noWorktree: workspaceOpts.noWorktree, slug })` に変更する。
- [x] `registerExitGuard(repoRoot)`（global scan 版、archive など）は無変更。

**Acceptance Criteria**:
- no-worktree で running 中にプロセス終了すると、worktree 走査なしで cwd state から job が特定され `awaiting-resume` に遷移する。
- worktree モードの exit-guard 挙動（per-job 走査 / global scan）が不変。
- `bun run typecheck` が green。

## T-10: archive Phase 2 を no-worktree でスキップする

- [x] `src/core/archive/orchestrator.ts` の Phase 0 で、選定した `state` から `const noWorktree = state.noWorktree === true;` を捕捉する。
- [x] Phase 2 の `if (worktreePath) { manager.remove ...; manager.prune ... }` を `if (worktreePath && !noWorktree) { ... }` に変更する。
- [x] sidecar / managed marker 削除、feature branch 削除（local + remote）は無変更で実行されることを確認する。
- [x] `runMergeThenArchive` 経由でも同じ orchestrator を通るため追加変更が不要であることを確認する。

**Acceptance Criteria**:
- no-worktree job の archive で worktree remove / prune が呼ばれない。
- no-worktree job の archive で feature branch の local + remote 削除が実行される。
- worktree job の archive は従来通り worktree remove / prune + branch 削除を行う。
- `bun run typecheck` が green。

## T-11: 単体テストを追加・更新する（実装インターフェース確定後）

- [x] `LocalRuntime.setupWorkspace` no-worktree run/resume のテスト: worktree manager の `create` が呼ばれないこと、run で `git checkout -b` が呼ばれること、dirty で `WORKTREE_DIRTY` が throw されること、sidecar が `worktreePath: null` で書かれること（worktree manager / spawnFn を DI で stub）。
- [x] `buildDeps` / `slugStoreOpts` の cwd フォールバック（worktreePath 不在で throw しない）のテスト。
- [x] exit-guard no-worktree 経路のテスト: worktree 走査せず cwd state から `awaiting-resume` に遷移する。
- [x] archive orchestrator のテスト: `state.noWorktree === true` で worktree remove/prune が呼ばれず branch 削除は呼ばれる。worktree job では従来通り。
- [x] state schema テスト: `noWorktree` が validateJobState を通ること、欠如 state が `undefined` で通ること。
- [x] CLI フラグ解析テスト: `--no-worktree` が run / job start / resume で受理されること。

**Acceptance Criteria**:
- 追加テストが green。
- no-worktree の各要件（worktree 不作成 / clean 必須 / sidecar null / exit-guard cwd 特定 / archive skip）を最低 1 つずつ検証するテストが存在する。

## T-12: 全体検証

- [x] `bun run typecheck && bun run test` が green。
- [x] worktree モード（フラグ無し）の既存テストが全て通ることを確認する。
- [x] request.md の受け入れ基準を全項目確認する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- request.md の受け入れ基準がすべて満たされている。
