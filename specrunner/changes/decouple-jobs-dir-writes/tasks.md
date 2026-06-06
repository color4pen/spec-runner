# Tasks: local runtime の state 書き込みを slug/sidecar に一本化する

> 実装順は T-01 → T-09。T-01〜T-03 が local 内部（bootstrap defer + slug 一本化）、T-04〜T-07 が cross-cutting persist 経路、T-08〜T-09 が検証。
> 各タスクは `bun run typecheck` が通る単位で区切る。

## T-01: `create()` から初期 state 構築を分離し `bootstrapJob` を追加する（D1）

- [x] `src/store/job-state-store.ts`: 純粋関数 `buildInitialJobState(params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string }): JobState` を切り出す（jobId 採番 + `JobState` 組み立てのみ、I/O なし）。
- [x] `JobStateStore.create()` を `buildInitialJobState()` + 既存の jobId ストア永続化（events.jsonl 初期 record + state.json）に書き換える。**外部から見た挙動（返り値・永続化）は不変**に保つ。
- [x] `src/core/port/runtime-strategy.ts`: `RuntimeStrategy` に `bootstrapJob(repoRoot: string, params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string }): Promise<JobState>` を追加（`RequestInfo` / `RepositoryInfo` は `state/schema` から import、port は既に同 module の型を使用）。
- [x] `src/core/runtime/local.ts`: `LocalRuntime.bootstrapJob()` を実装。`buildInitialJobState(params)` を返すのみ（**永続化しない**）。
- [x] `src/core/runtime/managed.ts`: `ManagedRuntime.bootstrapJob()` を実装。`JobStateStore.create(repoRoot, params)` を返す（現状の永続化挙動を維持）。
- [x] `src/core/command/pipeline-run.ts`: `JobStateStore.create(cwd, {...})` 呼び出しを `this.runtime.bootstrapJob(cwd, {...})` に置換。返り値 `jobState` から jobId / branch 名導出はそのまま。

**Acceptance Criteria**:
- `buildInitialJobState()` は I/O を行わず、`JobStateStore.create()` と同一の初期 `JobState`（jobId / history[init] / status=running / step=init / pid 等）を構築する。
- `JobStateStore.create()` の永続化挙動が適用前と同一（既存 `create()` テスト green）。
- local の `bootstrapJob()` 呼び出し単体では `.specrunner/jobs/<jobId>/` が作成されない。
- managed の `bootstrapJob()` は `.specrunner/jobs/<jobId>/` に初期 state を永続化する。
- `bun run typecheck` green。

## T-02: `setupWorkspace` の seeding と `updateJobState` の slug 一本化（D2）

- [x] `src/core/port/runtime-strategy.ts`: `WorkspaceOptions` に `bootstrapState?: JobState` を追加。
- [x] `src/core/command/pipeline-run.ts`: `prepare()` が返す `workspaceOpts` に `bootstrapState: jobState`（初期 state）を設定。
- [x] `src/core/runtime/local.ts` `setupWorkspace()`: **新規 worktree を作成する 3 経路**（run path / resume-recreate / resume-null）で、`manager.create()` 直後・既存の `updateJobState()` / `writeLivenessSidecar()` より前に、`opts?.bootstrapState` を新 worktree の slug ストアへ fresh persist（seed）する。`bootstrapState` 未指定時は seed をスキップ。worktree 再利用経路では seed しない。
- [x] `src/core/runtime/local.ts` `updateJobState()`: slug ストア専用に変更。slug ストアから load → mutate → slug ストアへ persist のみ。jobId ストアへの persist（現 L128）と jobId ストア load fallback（現 L121-122）を撤去。`slugOpts` は引き続き全 caller が明示的に渡す前提を維持。

**Acceptance Criteria**:
- run path: `setupWorkspace()` 後、worktree 内 `specrunner/changes/<slug>/state.json` + `events.jsonl` が初期 state を保持する。
- `updateJobState()` 実行で `.specrunner/jobs/<jobId>/` が作成・更新されない。
- `setupWorkspace()` 内の後続 `updateJobState()`（branch / request.path）が seed 済み slug ストアの load で成立しエラーにならない。
- 既存の `local.test.ts`（TC-LR-001〜）が seed 込みで green（必要なら `makeJobState()` 経由のセットアップに合わせて調整）。
- `bun run typecheck` green。

## T-03: machine-local / portable の writer を sidecar / slug に一貫させる（D3）

- [x] `src/core/runtime/local.ts`: machine-local フィールド（worktreePath / pid / session）の writer を `writeLivenessSidecar()` に集約する方針を確認し、`updateJobState()` 経由で machine-local を slug 正本へ書こうとしない（T-02 で slug-mode strip により担保済みであることを確認）。
- [x] `src/core/runtime/local.ts` `setupWorkspace()` の **worktree 再利用経路**（resume-reuse, 現 L210-217）で `writeLivenessSidecar(slug, jobId, existingWorktreePath)` を呼び、sidecar の `pid` を現プロセス値に refresh する。

**Acceptance Criteria**:
- resume-reuse 後、`.specrunner/local/<slug>/liveness.json` の `pid` が resume プロセスの pid に更新される。
- slug 正本（state.json）には worktreePath / pid / session が含まれない（slug-mode strip）。
- `isStaleRunning` が resume 直後の job を stale と誤判定しない。
- `bun run typecheck` green。

## T-04: `persistJobState` port を追加し runner 終端 persist を向け直す（D4）

- [x] `src/core/port/runtime-strategy.ts`: `RuntimeStrategy` に `persistJobState(jobId: string, slug: string, workspace: WorkspaceContext | null, state: JobState): Promise<void>` を追加（store を返さず persist を内包）。
- [x] `src/core/runtime/local.ts` `persistJobState()`: 書き込み可能な slug ストアを解決（`workspace?.worktreePath` → sidecar `liveness.json` の worktreePath → `resolveCanonicalStateDir(slug, cwd)` の順、いずれも実在確認）。解決できれば portable を slug ストアへ persist し machine-local を sidecar 更新。解決できなければ best-effort skip（jobId ストアには書かない）。
- [x] `src/core/runtime/managed.ts` `persistJobState()`: `new JobStateStore(jobId, this.cwd).persist(state)`（現状の jobId ストア書き込みを維持）。
- [x] `src/core/command/runner.ts`:
  - WORKSPACE_SETUP_FAILED（現 L124-136）: `new JobStateStore(jobState.jobId, repoRoot).fail(...)` を「`transitionJob(state, "failed", {...})` で in-memory に failed 化 → `this.runtime.persistJobState(jobId, slug, workspace ?? null, failedState)`」に置換。JSON 出力には in-memory の failedState を使う（jobId store を読まない）。
  - INIT_FAILED（現 L156-187）: `new JobStateStore(jobState.jobId, repoRoot).fail(...)` を「`transitionJob(state, "failed", {...})` で in-memory に failed 化 → `this.runtime.persistJobState(jobId, slug, workspace ?? null, failedState)`」に置換。JSON 出力には in-memory failed state を用いる。
  - pipeline crash（現 L191-225）: `new JobStateStore(jobState.jobId, repoRoot)` を `deps.storeFactory(jobState.jobId)` に置換。disk status が running の時のみ `fail()` する load-check ロジックは温存。

**Acceptance Criteria**:
- local の INIT_FAILED / crash で failed state が slug 正本に書かれ、`.specrunner/jobs/<jobId>/` は更新されない。
- local の WORKSPACE_SETUP_FAILED（worktree 未確立）で persist は skip され jobs-dir に書かれない（記録消失は D5 の許容事項）。
- managed の各終端 persist は jobId ストアへ書かれる（適用前と同一）。
- `bun run typecheck` green。

## T-05: `resolveStateStoreByJobId` helper を追加し resume の persist を向け直す（D4）

- [x] `src/core/job-access/`: `resolveStateStoreByJobId(repoRoot: string, jobId: string): Promise<JobStateStore | null>` を新設（`loadStateByJobId` の writable 版）。
  - sidecar `kind="local"`: worktree slug ストア（worktree 実在時）→ `resolveCanonicalStateDir` の changeDir ストア → なければ `null`。
  - sidecar `kind="managed"`: jobId ストア。
  - sidecar entry なし: jobId ストア（legacy 安全網）。
- [x] `src/core/command/resume.ts`:
  - stale-recovery persist（現 L123）と running 遷移 persist（現 L194）の `new JobStateStore(state.jobId, cwd).persist(...)` を `const store = await resolveStateStoreByJobId(cwd, state.jobId); if (store) await store.persist(...)` に置換。
  - local active job では worktree slug ストアへ、managed では jobId ストアへ書かれる。store が `null`（degraded）の場合は skip（後続の `setupWorkspace` seed が新 worktree に running state を書く）。
- [x] `src/core/command/resume.ts` `prepare()`: `workspaceOpts` に `bootstrapState: updatedState`（running 遷移後 state）を設定し、resume-recreate / resume-null 経路の `setupWorkspace` seed が running state を新 worktree の slug 正本へ書くことを保証する。

**Acceptance Criteria**:
- sidecar+worktree を持つ local job の resume で running 遷移が worktree slug 正本へ書かれ、jobs-dir は更新されない。
- worktree 消失 local job の resume では prepare の persist が skip され、recreate 後の seed（T-02）で running state が新 worktree に書かれる。
- managed job の resume は jobId ストアへ書かれる（適用前と同一）。
- 既存の resume テスト green。
- `bun run typecheck` green。

## T-06: cancel の persist を `resolveStateStoreByJobId` 経由にする（D4 / D6）

- [x] `src/core/cancel/runner.ts` `cancelSingleJob()`: canceled state の persist（現 L244）`new JobStateStore(jobId, deps.repoRoot).persist(updated)` を `const store = await resolveStateStoreByJobId(deps.repoRoot, jobId); if (store) await store.persist(updated)` に置換。`--purge` 分岐は不変。
- [x] cleanup（worktree+branch 削除）後に persist する既存の順序は維持（local は slug 正本が消失しているため store=`null`→skip となる）。sidecar（liveness.json）への追加削除は行わない（jobId 保持）。

**Acceptance Criteria**:
- sidecar を持つ active local job の cancel 後、canceled state は persist されず（degraded）jobs-dir は作成・更新されない。jobId は sidecar に残り `resolveId` で解決できる。
- managed / legacy（no-sidecar）job の cancel は jobId ストアへ canceled state を persist する（既存 cancel テスト green）。
- `--purge` の物理削除挙動が不変。
- `bun run typecheck` green。

## T-07: exit-guard の global persist を `resolveStateStoreByJobId` 経由にする（D4）

- [x] `src/core/lifecycle/exit-guard.ts` `handleGlobalExit()`: 各 running state の persist `new JobStateStore(state.jobId, repoRoot)` を `const store = await resolveStateStoreByJobId(repoRoot, state.jobId); if (!store) continue;` に置換し、awaiting-resume 遷移を解決ストアへ persist。
- [x] `handlePerJobExit()`（R1 で slug 化済み）は変更しない。

**Acceptance Criteria**:
- `handleGlobalExit` 経由で running の local job が awaiting-resume に遷移する際、slug 正本へ書かれ jobs-dir は更新されない。
- running の managed job は jobId ストアへ遷移が書かれる（適用前と同一）。
- 既存の exit-guard テスト green。
- `bun run typecheck` green。

## T-08: jobs-dir 書き込みゼロを検証する integration test を追加する

- [x] `tests/` に local runtime の run / resume / cancel を実 `LocalRuntime`（または bootstrap→setupWorkspace→step persist→終端を通す flow）で回し、実行後に `.specrunner/jobs/`（`getJobsDir(repoRoot)`）が作成されていないこと（`fs.access` が ENOENT）をアサートする test を追加。
- [x] sidecar（`.specrunner/local/<slug>/liveness.json`）併設下で、cancel 後も local が jobs-dir に書かないこと、jobId が sidecar から `resolveId` で解決できることをアサート。
- [x] state 更新後に slug 正本（worktree 内 `changes/<slug>/`）と sidecar が最新化されることをアサート。

**Acceptance Criteria**:
- run / resume / cancel いずれの実行後も `.specrunner/jobs/` が存在しない（local, sidecar 併設ケース）。
- slug 正本 + sidecar が最新化されることを検証するアサーションが存在する。
- 追加 test が green。

## T-09: 既存テスト整合と全体検証

- [x] `JobStateStore.create()` をセットアップに用いる既存テスト（`tests/state-store.test.ts`, `tests/resolve-job-id.test.ts`, cancel / resume / runner / local の各 test 等）が、本変更（create 挙動不変 + no-sidecar→jobId 安全網）の下で green であることを確認。破綻があれば最小修正。
- [x] `bun run typecheck && bun run test` を実行し green を確認。

**Acceptance Criteria**:
- `bun run typecheck` green。
- `bun run test` green（既存 + T-08 追加分）。
- R1 で移行済みの読み取り経路（`list()` / `resolveId()` / `loadStateByJobId` / `job show` / `job ls`）の既存テストが green。
