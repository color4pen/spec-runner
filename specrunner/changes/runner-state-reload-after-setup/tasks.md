# Tasks: setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する

## T-01: Add `reloadJobState` to RuntimeStrategy and RealRuntimeStrategy interfaces

- [ ] In `src/core/port/runtime-strategy.ts`, add optional method to `RuntimeStrategy`:
  ```ts
  reloadJobState?(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext,
  ): Promise<JobState>;
  ```
  Place it adjacent to `persistJobState` with a JSDoc comment explaining:
  - local: loads from slug store using `workspace.worktreePath ?? cwd` as stateRoot
  - managed: fail-closed throw（store 構成の reload 安全性が別 request で検証されるまで。
    seed 順序の安全性を確認できた場合のみ managedLocalStore からの load を許容 — D3 / T-03 と同一の選択）
  - throws on load error (caller is fail-closed)
- [ ] Add `reloadJobState` as required (non-optional) to `RealRuntimeStrategy`:
  ```ts
  reloadJobState(jobId: string, slug: string, workspace: WorkspaceContext): Promise<JobState>;
  ```
  This enforces that `LocalRuntime` and `ManagedRuntime` must implement it.

**Acceptance Criteria**:
- `src/core/port/runtime-strategy.ts` has `reloadJobState?` in `RuntimeStrategy` and non-optional in `RealRuntimeStrategy`
- `tsc` compiles after this change alone (before implementing the method in the runtime classes)

---

## T-02: Implement `reloadJobState` in LocalRuntime

- [ ] Add `async reloadJobState(jobId: string, slug: string, workspace: WorkspaceContext): Promise<JobState>` to `LocalRuntime` in `src/core/runtime/local.ts`
- [ ] Derive `stateRoot` as `workspace.worktreePath ?? this.cwd`
- [ ] Construct `new JobStateStore(jobId, this.cwd, { slug, stateRoot })` and call `.load()`
- [ ] Return the loaded state cast as `JobState` (safe: no steps at this lifecycle point)
- [ ] Add a code comment at the cast site: `// Safe cast: steps is always {} at reload point (no step runs yet)`
- [ ] Do NOT catch errors — let them propagate to the caller (fail-closed is the caller's responsibility)

**Acceptance Criteria**:
- `LocalRuntime` implements `reloadJobState` and satisfies `RealRuntimeStrategy`
- Method uses `workspace.worktreePath ?? this.cwd` as stateRoot (covers both worktree and no-worktree modes)
- Errors propagate (no swallowing)
- `tsc` passes

---

## T-03: Implement `reloadJobState` fail-closed throw in ManagedRuntime

- [ ] Add `async reloadJobState(_jobId: string, _slug: string, _workspace: WorkspaceContext): Promise<JobState>` to `ManagedRuntime` in `src/core/runtime/managed.ts`
- [ ] The signature does NOT receive the original `jobState`, so a passthrough is impossible (spec-review F-01). Implement fail-closed: throw `new Error("reloadJobState not implemented for managed runtime")` — this makes managed runtime fail-closed on reload (consistent with D3).
  > Note: the optional-chaining call in runner.ts (D4) uses `?.`, so if managed runtime does NOT have the method, the fallback is used instead. But since `RealRuntimeStrategy` requires it, it must be present. The safest production behavior for managed is to throw — the pipeline won't start until managed runtime is fixed in a separate request.
  >
  > Alternative: load from `this.managedLocalStore(jobId, slug)` — this would actually fix managed runtime too. If the implementer determines this is safe (managed local store is seeded before any updateJobState calls, same as local), they may implement the full load. Document the choice in a code comment.
- [ ] Add a code comment: `// Managed runtime: reload not verified for this store topology. See separate request.`
- [ ] Whichever implementation is chosen, `ManagedRuntime` must satisfy `RealRuntimeStrategy`

**Acceptance Criteria**:
- `ManagedRuntime` implements `reloadJobState`
- `tsc` passes
- `ManagedRuntime` satisfies `RealRuntimeStrategy` type check

---

## T-04: Update runner.ts — delete mirror block, add reload with fail-closed

- [ ] **Delete** lines 169–181 in `src/core/command/runner.ts` (the manual mirror block):
  ```ts
  // Reflect worktreePath into in-memory jobState...
  if (workspace.worktreePath !== undefined) {
    jobState.worktreePath = workspace.worktreePath;
  }
  // Reflect branch set by setupWorkspace()...
  if (workspace.branch !== undefined && !jobState.branch) {
    jobState.branch = workspace.branch;
  }
  ```
- [ ] After the `setupWorkspace()` success path (after the catch block on line ~167), add:
  ```ts
  // Reload in-memory state from slug store so pipeline receives all fields written
  // by setupWorkspace() (worktreePath, synthesizedCommits, branch). Deletes the
  // former manual mirror — the store is the single source of truth post-setup.
  if (this.runtime.reloadJobState) {
    try {
      jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
    } catch (err) {
      // fail-closed: reload failure prevents pipeline start
      const reloadError = { code: "RELOAD_FAILED", message: (err as Error).message, hint: "" };
      const { state: reloadFailedState } = transitionJob(jobState, "failed", {
        trigger: "store-fail",
        reason: reloadError.message,
        patch: { error: reloadError, step: "init" },
      });
      await this.runtime.persistJobState(jobState.jobId, slug, workspace, reloadFailedState);
      logError(`Failed to reload job state after workspace setup: ${(err as Error).message}`);
      if (json) {
        stdoutWrite(formatRunResultJson(buildRunResult(reloadFailedState, slug)));
      }
      closeVerboseLog();
      closePipelineLog();
      return 1;
    }
  }
  ```
- [ ] Ensure `jobState` variable is declared with `let` (not `const`) so it can be reassigned by the reload; verify this is already the case (or change `const` to `let` at its declaration)

**Acceptance Criteria**:
- Lines 169–181 are gone from runner.ts
- Reload block appears immediately after the workspace setup success path
- `reloadJobState` is called via optional-chaining guard so existing `RuntimeStrategy`-typed test fakes (which lack the method) fall through without behavior change
- Reload failure → return 1 with `failed` state persisted
- `tsc` passes

---

## T-05: Add unit tests — reload fail-closed and field preservation

File: `tests/unit/core/runtime/runner-reload-after-setup.test.ts`

- [ ] **TC-010: reloadJobState returns state with synthesizedCommits**
  Use `LocalRuntime` with real `JobStateStore` (tempDir), mock spawnFn. Seed a state with `synthesizedCommits: ["abc123"]` in the slug store. Call `reloadJobState()`. Assert returned state has `synthesizedCommits: ["abc123"]`.

- [ ] **TC-011: Reload fail-closed — runner does not start pipeline**
  Build a `CommandRunner` subclass with a `TestRuntime` that implements `reloadJobState` as a reject stub. Assert that `pipeline.run()` is never called and the return value is 1.
  DESTROY comment: "DESTROY: remove the `reloadJobState` call in runner.ts (restore mirror) → this test still passes because it tests the fail-closed path only. The sealing test is TC-013."

- [ ] **TC-012: Field preservation — reviewers/noWorktree/issueNumber survive reload**
  Use `LocalRuntime` with real `JobStateStore` (tempDir), mock spawnFn.
  1. Build a `bootstrapState` with `reviewers: [mockReviewer]`, `noWorktree: true`, `issueNumber: 42`
  2. Seed the slug store with this `bootstrapState`
  3. Write synthesizedCommits and branch to the store via a second `JobStateStore.persist()` call (simulating what `setupWorkspace()` updateJobState calls do)
  4. Call `reloadJobState()` with a workspace pointing to tempDir
  5. Assert the returned state has `reviewers`, `noWorktree: true`, `issueNumber: 42` AND `synthesizedCommits` AND `branch`

**Acceptance Criteria**:
- TC-010, TC-011, TC-012 are present and green
- Tests use `vi.fn()` for spawnFn and real `JobStateStore` for store operations (not mocked store)
- No use of `host.updateJobState` mock (real store I/O)

---

## T-06: Add integration test — real store + real git (封鎖テスト)

File: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts`

- [ ] **TC-013: new-run bootstrap → reload → in-memory synthesizedCommits → egress passes**
  1. Create a real git repo in `$TMPDIR` with `git init`, `git config user.*`, initial commit, bare remote `origin`, `git push origin HEAD:main`
  2. Create `LocalRuntime` with real `spawnFn` pointing to the repo
  3. Build `bootstrapState` with `reviewers: []`, `noWorktree: false`, `issueNumber: undefined`
  4. Call `runtime.setupWorkspace(slug, jobId, { requestFilePath, branchName, bootstrapState })` — no manual seed
  5. Call `runtime.reloadJobState(jobId, slug, workspace)` — captures the **in-memory** reloaded state
  6. Assert: `reloadedState.synthesizedCommits` contains the bootstrap commit OID (in-memory path, NOT store read)
  7. Call `verifyEgressLedger({ cwd: workspace.cwd, ledger: reloadedState.synthesizedCommits!, spawnFn })` with a step commit added after bootstrap
  8. Assert: `verifyEgressLedger` resolves without throwing (`EGRESS_UNKNOWN_COMMIT` is absent)

  DESTROY comment: "DESTROY: `LocalRuntime.reloadJobState()` の実装を破壊する（メソッド削除または store 読取りを bootstrapState 返却に差し替え）→ step 6 の synthesizedCommits assert が fail する。注意: 本 TC は runtime 層のテストであり、runner.ts の配線（reload 呼び出しの有無）は封鎖しない — runner 経路の封鎖は TC-013b が担う（spec-review F-02）。"

- [ ] **TC-013b: runner 経路の封鎖 — pipeline に渡る state が reload 由来であること**
  `CommandRunner.execute()` 経由の統合テスト。fake RuntimeStrategy を注入する:
  1. fake の `setupWorkspace()` は WorkspaceContext を返し、`reloadJobState()` は sentinel を含む state
     （`synthesizedCommits: ["sentinel-oid-123"]`）を返す
  2. pipeline 側は最小 stub（既存の runner テストの fake pipeline / buildDeps seam を利用）とし、
     `pipeline.run()`（または runner が state を引き渡す seam）が受け取った state を capture する
  3. Assert: capture した state の `synthesizedCommits` に `"sentinel-oid-123"` が含まれる
     （= runner が reload 結果を下流へ渡している。受け入れ基準「in-memory 経路の直接 assert」の充足点）

  DESTROY comment: "DESTROY: runner.ts の `reloadJobState` 呼び出しを削除し旧 mirror（worktreePath/branch のみ）を復元する → capture した state に sentinel が含まれず TC-013b が fail する。"

- [ ] **TC-014: halt-path persist does not revert synthesizedCommits (non-destructive halt)**
  1. Set up state with `synthesizedCommits: [bootstrapOid]` in the store (extend TC-013 setup or standalone)
  2. Do reload: `reloadedState = await runtime.reloadJobState(jobId, slug, workspace)`
  3. Assert `reloadedState.synthesizedCommits` contains `bootstrapOid`
  4. Simulate a halt-path persist: `new JobStateStore(jobId, repoRoot, { slug, stateRoot }).persist(reloadedState)`
  5. Reload again from store and assert `synthesizedCommits` still contains `bootstrapOid` (no reversion to null)

**Acceptance Criteria**:
- TC-013 and TC-014 are present and green
- TC-013 asserts on the value returned by `reloadJobState()` (in-memory path), not a subsequent store read
- Real git operations are used (no mocked spawnFn for git)
- No manual seed of synthesizedCommits before the test (it must come from the setupWorkspace → reload path)
- Test timeout: ≥ 30 000ms (real git ops)

---

## T-07: Verify existing tests remain green

- [ ] Run `bun run typecheck` — must pass with no new errors
- [ ] Run `bun run test` — must pass; specifically confirm:
  - `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` — green (unchanged)
  - `tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts` — green (unchanged)
  - `tests/bootstrap-egress-ledger-e2e.test.ts` — green (unchanged)
  - `tests/unit/core/command/runner.test.ts` — green (test fakes without `reloadJobState` fall through via optional-chain guard)
- [ ] Confirm no new TypeScript errors in `src/core/runtime/managed.ts` or `src/core/runtime/local.ts`

**Acceptance Criteria**:
- `typecheck && test` exits 0
- No test file outside `specrunner/changes/runner-state-reload-after-setup/` is modified
