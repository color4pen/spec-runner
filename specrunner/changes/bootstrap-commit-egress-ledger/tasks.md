# Tasks: bootstrap-commit-egress-ledger

## T-01: `workspace-materializer.ts` — capture bootstrap OID and append to ledger

Modify `src/core/runtime/workspace-materializer.ts` (`new-run` arm, after the `git commit` block at ~line 224).

- [x] Add import: `import { appendSynthesizedCommit } from "../../state/schema/operations.js";`
- [x] After the `if (gitCommitResult.exitCode !== 0)` throw block, add:
  ```
  const revParseResult = await this.host.spawnFn(
    "git", ["rev-parse", "HEAD"], { cwd: worktreePath },
  );
  if (revParseResult.exitCode !== 0) {
    await this.host.manager.remove(worktreePath, this.host.cwd).catch(() => {});
    await this.host.manager.prune(this.host.cwd).catch(() => {});
    throw new Error(
      `Failed to capture bootstrap commit OID: ${revParseResult.stderr.trim()}`
    );
  }
  const bootstrapOid = revParseResult.stdout.trim();
  await this.host.updateJobState(
    jobId,
    (s) => appendSynthesizedCommit(s, bootstrapOid),
    slugOpts,
  );
  ```
- [x] Verify: this block is inside the `if (opts?.requestFilePath)` guard (same guard as the commit block).
- [x] Verify: `slugOpts` is already defined earlier in the `new-run` arm at `{ slug, stateRoot: worktreePath }`.

**Acceptance Criteria**:
- After the `new-run` arm completes with `requestFilePath` set, `host.updateJobState` has been called with a mutator that appends the bootstrap OID to `synthesizedCommits`.
- If `git rev-parse HEAD` returns non-zero, `materialize()` throws and `host.manager.remove` + `host.manager.prune` have been called (same cleanup as the commit-failure path).

---

## T-02: `local.ts` — capture bootstrap OID and append to ledger

Modify `src/core/runtime/local.ts` (`setupWorkspaceNoWorktree`, after the `git commit` block at ~line 411).

- [x] Add import: `import { appendSynthesizedCommit } from "../../state/schema/operations.js";`
- [x] After the `if (gitCommitResult.exitCode !== 0)` throw block, add:
  ```
  const revParseResult = await this.spawnFn(
    "git", ["rev-parse", "HEAD"], { cwd: this.cwd },
  );
  if (revParseResult.exitCode !== 0) {
    throw new Error(
      `Failed to capture bootstrap commit OID: ${revParseResult.stderr.trim()}`
    );
  }
  const bootstrapOid = revParseResult.stdout.trim();
  await this.updateJobState(
    jobId,
    (s) => appendSynthesizedCommit(s, bootstrapOid),
    slugOpts,
  );
  ```
- [x] Verify: this block is inside both `if (isRunPath && opts?.requestFilePath)` guards.
- [x] Verify: `slugOpts` is already defined earlier in the function at `{ slug, stateRoot: this.cwd }`.

**Acceptance Criteria**:
- After `setupWorkspaceNoWorktree()` completes with `requestFilePath` set, `updateJobState` has been called with a mutator that appends the bootstrap OID to `synthesizedCommits`.
- If `git rev-parse HEAD` returns non-zero, `setupWorkspaceNoWorktree()` throws.

---

## T-03: `managed.ts` — capture bootstrap OID and append to ledger

Modify `src/core/runtime/managed.ts` (`setupWorkspace`, after the `git commit` block at ~line 241).

- [x] Add import: `import { appendSynthesizedCommit } from "../../state/schema/operations.js";`
- [x] After the `if (gitCommitResult.exitCode !== 0)` throw block, add:
  ```
  const revParseResult = await this.spawnFn(
    "git", ["rev-parse", "HEAD"], { cwd: this.cwd },
  );
  if (revParseResult.exitCode !== 0) {
    throw new Error(
      `Failed to capture bootstrap commit OID: ${revParseResult.stderr.trim()}`
    );
  }
  const bootstrapOid = revParseResult.stdout.trim();
  await this.updateJobState(
    jobId,
    (s) => appendSynthesizedCommit(s, bootstrapOid),
  );
  ```
- [x] Verify: this block is inside the `if (opts?.requestFilePath)` guard, BEFORE the `git push origin <branchName>` block that follows at ~line 244.
- [x] Note: managed `updateJobState` takes only `(jobId, mutator)` — no `slugOpts` parameter.

**Acceptance Criteria**:
- After `setupWorkspace()` completes with `requestFilePath` set, `updateJobState` has been called with a mutator that appends the bootstrap OID to `synthesizedCommits`.
- If `git rev-parse HEAD` returns non-zero, `setupWorkspace()` throws (and the subsequent push is NOT called).

---

## T-04: Unit tests — `workspace-materializer.ts` bootstrap OID recording (TC-BE-001, TC-BE-004a)

Add tests to `tests/attach/workspace-materializer-attach.test.ts` (or a new test file `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts`).

### TC-BE-001: bootstrap OID is appended to synthesizedCommits via updateJobState

- [x] Build a `MaterializerHost` stub where:
  - `spawnFn` returns `{ exitCode: 0, stdout: "abc123def456abc123def456abc123def456abc1\n" }` for `git rev-parse HEAD` and `{ exitCode: 0 }` for all others.
  - `updateJobState` is a mock that applies each mutator sequentially to a tracked in-memory state (initial state has `synthesizedCommits: []`).
  - `manager.create` returns a valid temp directory.
- [x] Call `materializer.materialize(slug, jobId, { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/slug" }, { requestFilePath: "/tmp/request.md", bootstrapState: initialState })`.
- [x] Assert: the tracked state after all `updateJobState` calls includes `"abc123def456abc123def456abc123def456abc1"` in `synthesizedCommits`.

### TC-BE-004a: rev-parse failure → throws and cleans up worktree

- [x] Build a `MaterializerHost` stub where:
  - `spawnFn` returns `{ exitCode: 0 }` for `git add` and `git commit`, but `{ exitCode: 128, stderr: "fatal: not a git repo" }` for `git rev-parse HEAD`.
  - `manager.remove` and `manager.prune` are vi.fn() mocks.
- [x] Call `materialize()` with `requestFilePath` set.
- [x] Assert: `materialize()` rejects (throws).
- [x] Assert: `host.manager.remove` was called.
- [x] Assert: `host.manager.prune` was called.

**Acceptance Criteria**:
- TC-BE-001 passes: synthesizedCommits contains the bootstrap OID after materialize().
- TC-BE-004a passes: materialize() throws on rev-parse failure + worktree cleaned.
- Both tests must fail (red) if the T-01 implementation is removed.

---

## T-05: Unit tests — `local.ts` bootstrap OID recording (TC-BE-002, TC-BE-004b)

Add tests to `tests/unit/core/runtime/local.test.ts` or a new test file.

### TC-BE-002: bootstrap OID is appended to synthesizedCommits

- [x] Add a `buildMockSpawnFn` variant (or extend the existing helper) that returns a known OID (`"deadbeef..." `) for `git rev-parse HEAD` calls.
- [x] Set up a `LocalRuntime` with `--no-worktree` semantics (i.e., use a path that calls `setupWorkspaceNoWorktree`). Check how `--noWorktree` is activated: look at `setupWorkspace()` in local.ts and how it delegates to `setupWorkspaceNoWorktree` vs `materializeWorktree`.
- [x] Call `setupWorkspace(slug, jobId, { requestFilePath: "/tmp/request.md", bootstrapState: initialState })` with the runtime configured for no-worktree.
- [x] Load the persisted state from the slug store and assert: `synthesizedCommits` contains the expected OID.

### TC-BE-004b: rev-parse failure → setupWorkspaceNoWorktree throws

- [x] Build a spawnFn mock where `git commit` succeeds but `git rev-parse HEAD` returns exitCode ≠ 0.
- [x] Call `setupWorkspace()` in no-worktree mode with `requestFilePath` set.
- [x] Assert: it rejects (throws).

**Acceptance Criteria**:
- TC-BE-002 passes: persisted state has the bootstrap OID in synthesizedCommits.
- TC-BE-004b passes: throws on rev-parse failure.
- Both must fail (red) if the T-02 implementation is removed.

---

## T-06: Unit tests — `managed.ts` bootstrap OID recording (TC-BE-003, TC-BE-004c)

Add tests to `tests/unit/core/runtime/managed.test.ts`.

### TC-BE-003: bootstrap OID is appended to synthesizedCommits

- [x] Extend `buildManagedMockSpawnFn()` (or add a new variant) that returns a known OID for `git rev-parse HEAD`.
- [x] Call `setupWorkspace(slug, jobId, { branchName: "feat/...", requestFilePath: "/tmp/request.md", bootstrapState: initialJobState })`.
- [x] Load the persisted managed local state from `.specrunner/local/<slug>/state.json` and assert: `synthesizedCommits` contains the expected OID.

### TC-BE-004c: rev-parse failure → setupWorkspace throws

- [x] Build a spawnFn mock where `git checkout -b`, `git push`, `git add`, and `git commit` all succeed, but `git rev-parse HEAD` returns exitCode ≠ 0.
- [x] Call `setupWorkspace()` with `branchName` and `requestFilePath` set.
- [x] Assert: it rejects (throws).

**Acceptance Criteria**:
- TC-BE-003 passes: persisted state has the bootstrap OID in synthesizedCommits.
- TC-BE-004c passes: throws on rev-parse failure.
- Both must fail (red) if the T-03 implementation is removed.

---

## T-07: Integration test — fabricated bootstrap → first push egress passes (TC-BE-005)

Create `tests/bootstrap-egress-ledger-e2e.test.ts` using real git commands.

### Setup helpers (reuse patterns from `pipeline-sole-committer-e2e.test.ts`)

- [x] `createGitRepo(dir)`: init, set user.email + user.name.
- [x] `createBareRemote(dir)`: `git init --bare`.
- [x] `gitSync(args, cwd)`: `spawnSync("git", args, ...)` throwing on non-zero.
- [x] `makePipelineSpawnFn(repoDir)`: returns a `SpawnFn` (from `util/spawn.ts`) that delegates to `spawnSync` for all git commands except `push` (which returns exitCode 0 without executing — push intercepted).

### TC-BE-005a: egress passes when bootstrap OID is in ledger

- [x] Create real git repo + bare remote in `$TMPDIR`.
- [x] Make an initial commit in the repo and push it to the remote (`git push <remote> HEAD:main`).
- [x] Create the feature branch: `git checkout -b feat/test-slug`.
- [x] Simulate the fixed bootstrap path:
  - Write a file to `specrunner/changes/test-slug/request.md` in the repo dir.
  - `gitSync(["add", "specrunner/changes/test-slug/request.md"], repoDir)`.
  - `gitSync(["commit", "-m", "add request.md for test-slug", "--", "specrunner/changes/test-slug"], repoDir)`.
  - Capture `bootstrapOid = gitSync(["rev-parse", "HEAD"], repoDir)`.
- [x] Simulate a scoped step commit:
  - Write a file to `src/impl.ts`.
  - `gitSync(["add", "src/impl.ts"], repoDir)`.
  - `gitSync(["commit", "-m", "step: implementer"], repoDir)`.
  - Capture `stepOid = gitSync(["rev-parse", "HEAD"], repoDir)`.
- [x] Call `await verifyEgressLedger({ cwd: repoDir, ledger: [bootstrapOid, stepOid], spawnFn: makePipelineSpawnFn(repoDir) })`.
- [x] Assert: resolves without error.

### TC-BE-005b: egress fails when bootstrap OID is absent (destruction confirmation)

- [x] Use the same real git setup as TC-BE-005a (same commits).
- [x] Call `await verifyEgressLedger({ cwd: repoDir, ledger: [stepOid], spawnFn })` — bootstrap OID intentionally omitted.
- [x] Assert: rejects (throws).
- [x] Assert: the thrown error code is `ERROR_CODES.EGRESS_UNKNOWN_COMMIT` (from `src/errors.ts`).

**Acceptance Criteria**:
- TC-BE-005a passes: egress resolves when bootstrap OID is in ledger.
- TC-BE-005b passes: egress throws EGRESS_UNKNOWN_COMMIT when bootstrap OID is absent.
- TC-BE-005a MUST fail (red) if `bootstrapOid` is removed from the ledger (simulating pre-fix behavior).
- TC-BE-005b serves as the destruction confirmation: it must remain green after the fix.

---

## T-08: Verify `typecheck && test` green

- [x] Run `bun run typecheck` — zero errors.
- [x] Run `bun run test` — all tests pass, including existing egress / synthesis / revision-binding tests.
- [x] Confirm: existing tests in `tests/unit/step/pipeline-sole-committer-egress.test.ts`, `tests/unit/state/pipeline-sole-committer-state.test.ts`, and `tests/unit/step/pipeline-sole-committer-synthesis.test.ts` pass without modification.
