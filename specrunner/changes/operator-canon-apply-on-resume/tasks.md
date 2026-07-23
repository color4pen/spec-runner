# Tasks: operator-canon-apply-on-resume

## T-01: Add `src/core/resume/apply-canon.ts`

New module in `src/core/resume/` providing two exported functions.

- [ ] Create `src/core/resume/apply-canon.ts`
- [ ] Export `detectCanonDirtyPaths(slug: string, worktreePath: string, spawnFn: SpawnFn): Promise<string[]>`
  - Run `git status --porcelain -z --no-renames` via `runSubprocess(spawnFn, "git", [...], { cwd: worktreePath })`
  - Parse NUL-delimited output: each entry is `"XY PATH"` (2-char status + space + path). Entries shorter than 4 chars are skipped.
  - A path is dirty when X ≠ `' '` (staged change) OR Y ≠ `' '` and Y ≠ `'?'` (worktree change). Untracked-only files (XY = `'??'`) are included only if in `protectedCanonPaths` (rare but valid if operator added a new canon file).
  - Return paths that are in `new Set(protectedCanonPaths(slug))` (intersect dirty paths with protected set).
  - **Throw on any git failure**（fail-closed — spec-review F2）: `git status` が失敗した場合に `[]` を
    返すと「dirty なし」と区別できず、R2 の無言破棄廃止が「status が成功した場合に限る」条件付き保証に
    劣化する。検出不能 = 判定不能として resume を開始しない（scoped 残余検査の status 失敗 fail-closed
    と同じ規則 — #893 D5）。caller（resume 入口）は throw を fail-closed 停止 + 案内表示として扱う。
- [ ] Export `commitOperatorCanon(slug: string, worktreePath: string, paths: string[], spawnFn: SpawnFn): Promise<string>`
  - `git add -- <paths>` via `runSubprocess`; throw `Error` on non-zero exit.
  - `git commit -m "operator-apply: <slug>" -- <paths>` via `runSubprocess`; throw `Error` on non-zero exit.
  - `git rev-parse HEAD` via `gitExec`; throw `Error` if result is null.
  - Return the new commit OID (trimmed HEAD).
- [ ] Imports:
  - `protectedCanonPaths` from `../step/write-scope.js`
  - `runSubprocess`, `gitExec`, `type SpawnFn` from `../../util/git-exec.js`
- [ ] Do not import `defaultSpawnFn` — callers inject it.

**Acceptance Criteria**:
- `detectCanonDirtyPaths` returns only paths that are both in `protectedCanonPaths(slug)` and dirty in the worktree or index.
- `detectCanonDirtyPaths` returns `[]` when the worktree is clean.
- `detectCanonDirtyPaths` throws when `git status` fails（fail-closed — spec-review F2。caller は resume 不開始 + 案内表示として扱う）.
- `commitOperatorCanon` creates a git commit whose message equals `operator-apply: <slug>` and whose changed-file list contains exactly the specified paths.
- `commitOperatorCanon` returns the new HEAD OID as a non-empty string.
- `commitOperatorCanon` throws when `git add` or `git commit` fails.

---

## T-02: Add `--apply-canon` flag to CLI

- [ ] In `src/cli/command-registry.ts`: add `"apply-canon": { type: "boolean" }` to the `resume` sub-command's `flags` map (alongside `force`, `verbose`, `json`, `no-worktree`, etc.).
- [ ] In `src/cli/command-registry.ts`: pass `applyCanon: !!parsed.flags["apply-canon"]` inside the object passed to `runResume(parsed.positional!, { ... })`.
- [ ] In `src/cli/resume.ts`: add `applyCanon?: boolean` to the `ResumeOptions` interface (alongside the existing `from`, `force`, `logLevel`, etc.).
- [ ] In `src/cli/resume.ts` `runResumeCore`: forward `applyCanon: options.applyCanon` when constructing `ResumeCommand(runtime, events, slug, { ...options, ... })`.

**Acceptance Criteria**:
- `specrunner job resume --apply-canon <slug>` parses without error.
- `applyCanon: true` reaches `ResumeCommand`.
- All existing resume flags (`--force`, `--from`, `--verbose`, `--quiet`, `--prompt`, `--prompt-file`, `--json`, `--no-worktree`) continue to work without regression.

---

## T-03: Implement apply-canon logic in `ResumeCommand.prepare()`

- [ ] In `src/core/command/resume.ts`: add `applyCanon?: boolean` to the `ResumeOptions` interface.
- [ ] Refactor the "transition to running" block so that the `JobStateStore` reference (`runStore`) is captured in an outer variable (outside the inner try-block) for reuse:
  ```
  let runStore: JobStateStore | null = null;
  ...
  // noWorktree branch: persist via dedicated store but do NOT capture runStore
  // non-noWorktree branch: runStore = await resolveStateStoreByJobId(cwd, state.jobId); ...persist
  ```
- [ ] After `resolvedWorktreePath` is resolved, add the apply-canon gate (only when `resolvedWorktreePath` is non-null AND `resolvedSlug` is non-null):
  ```
  const dirtyCanonPaths = await detectCanonDirtyPaths(resolvedSlug, resolvedWorktreePath, defaultSpawnFn);
  if (dirtyCanonPaths.length > 0) {
    if (this.options.applyCanon) {
      // Commit and record
      const oid = await commitOperatorCanon(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, defaultSpawnFn);
      updatedState = appendSynthesizedCommit(updatedState, oid);
      if (runStore) await runStore.persist(updatedState);
      logInfo(`[apply-canon] operator-apply commit ${oid} (paths: ${dirtyCanonPaths.join(", ")})`);
    } else {
      logError(`Protected canon paths are dirty in the worktree: ${dirtyCanonPaths.join(", ")}`);
      stderrWrite(`Hint: Use --apply-canon to commit these changes as an operator-apply commit, or discard them (git checkout HEAD -- <path>) before resuming.`);
      throw new PrepareError(1, "Protected canon paths are dirty; use --apply-canon or discard");
    }
  }
  ```
- [ ] If `resolvedWorktreePath` is null and `this.options.applyCanon` is true: print a warning (`stderrWrite`) that `--apply-canon` has no effect without a worktree, then continue normally.
- [ ] Import `detectCanonDirtyPaths`, `commitOperatorCanon` from `../resume/apply-canon.js`.
- [ ] Import `defaultSpawnFn` from `../../util/git-exec.js`.
- [ ] Import `appendSynthesizedCommit` from `../../state/schema/operations.js` (may already be imported; verify).
- [ ] Ensure `JobStateStore` type is imported for the `runStore` variable type annotation.

**Acceptance Criteria**:
- With `--apply-canon` + dirty protected canon paths: operator-apply commit is created, OID in `state.synthesizedCommits`, state persisted, step starts.
- With `--apply-canon` + clean worktree: no commit created, step starts normally.
- Without `--apply-canon` + dirty protected canon paths: exits 1, step NOT started, error message lists the dirty paths, hint mentions `--apply-canon`.
- Without `--apply-canon` + clean worktree: step starts normally (no regression).
- `--no-worktree` mode (`resolvedWorktreePath` is null): dirty check skipped, `--apply-canon` ignored with a warning, step starts normally.

---

## T-04: Update `CANON_FINDING_ESCALATION` hint in `src/core/step/commit-orchestrator.ts`

- [ ] At the `hint:` property (currently line 369), replace the current value:
  - **Old**: `"保護正典への fixable finding が write-scope により解消不能です。escalation reason の finding を手動で修正し、job resume で再開してください。"`
  - **New**: `"保護正典への fixable finding が write-scope により解消不能です。escalation reason の finding を手動で修正したうえで、job resume <slug> --apply-canon で operator 適用 commit として取り込んでから再開してください。手動の git 操作 (commit / push) は不要です。"`
    (注: spec.md の negative assertion は部分文字列 `git commit` / `git push` の非含有を検査する。
    「手動の git 操作 (commit / push)」はこの 2 語連結を含まないため両立する — spec-review F1)

**Acceptance Criteria**:
- The updated hint contains `--apply-canon`.
- The updated hint does NOT contain the strings `git push` or `git commit` as instructions.
- The existing structure of the `state.error` object (code, message, hint fields) is unchanged.

---

## T-05: Update `buildCanonEscalationReason` in `src/core/step/canon-escalation.ts`

- [ ] In `buildCanonEscalationReason`, update the final line of the returned join array:
  - **Old**: `"fixer は write-scope により当該 file を修正できない。operator の適用が必要。"`
  - **New**: `"fixer は write-scope により当該 file を修正できない。保護正典を修正後、job resume <slug> --apply-canon で operator 適用 commit として取り込んでから再開してください。"`

**Acceptance Criteria**:
- The output of `buildCanonEscalationReason([...])` contains the substring `--apply-canon`.
- The `[CANON_FINDING_ESCALATION]` prefix, finding lines, and explanation lines are preserved.

---

## T-06: Integration test — `tests/operator-canon-apply-on-resume-e2e.test.ts`

Create a new integration test file using real git repos in `$TMPDIR`.

- [ ] **TC-R1 (封鎖 / mado-os scenario reproduction)**: end-to-end flow
  - Set up a real git repo + bare origin; make initial commit + push.
  - Write job state file with `status: "awaiting-resume"`, `synthesizedCommits: [baseOid]`, a worktree path.
  - In the worktree, hand-edit a protected canon path (`specrunner/changes/<slug>/design.md`).
  - Also dirty a non-canon path (`src/foo.ts`).
  - Call `detectCanonDirtyPaths` → assert it returns `["specrunner/changes/<slug>/design.md"]` only.
  - Call `commitOperatorCanon` → assert a commit is created with message `operator-apply: <slug>`.
  - Assert `git diff-tree --name-only <oid>` returns only the canon path (not `src/foo.ts`).
  - Call `appendSynthesizedCommit(state, oid)` → assert OID is in `synthesizedCommits`.
  - Call `verifyEgressLedger` with the updated ledger → assert it does NOT throw.
  - Assert `src/foo.ts` is still dirty in the worktree after `commitOperatorCanon`.

- [ ] **TC-R2 (`--apply-canon` scope restriction)**: only protected canon paths are committed
  - Worktree dirty: one protected canon path + one non-canon path.
  - After `commitOperatorCanon`: commit contains ONLY the canon path.
  - Non-canon path remains dirty.

- [ ] **TC-R3 (fail-closed without flag)**: test via `ResumeCommand.prepare()` mock harness
  - Construct a minimal `ResumeCommand` with `applyCanon: false`.
  - Worktree has a dirty protected canon path.
  - Assert `prepare()` throws `PrepareError` with exit code 1.
  - Assert the error message contains the dirty path name.
  - Assert the step was NOT started.

- [ ] **TC-R4 (egress ledger)**: operator OID passes egress check
  - After `commitOperatorCanon` returns `oid`, build a ledger `[baseOid, oid]`.
  - Call `verifyEgressLedger({ cwd: worktreePath, ledger, spawnFn })` against the real git repo.
  - Assert no `EGRESS_UNKNOWN_COMMIT` error is thrown.

- [ ] **TC-R5 (hint text)**: import the hint value and assert it contains `--apply-canon`
  - Load the `CANON_FINDING_ESCALATION` hint from `commit-orchestrator.ts` (the string literal at the relevant location, or extract via a test helper that calls the code path).
  - Assert the hint string contains `--apply-canon`.
  - Assert `buildCanonEscalationReason([{ file: "specrunner/changes/x/design.md", title: "t", resolution: "fixable" }])` contains `--apply-canon`.

- [ ] **TC-R6 (destruction confirmation)**: document the reversal
  - Add an inline comment in the test file documenting: "removing the `dirtyCanonPaths.length > 0 && !applyCanon` fail-closed guard from `ResumeCommand.prepare()` causes TC-R3 to fail."
  - Optionally implement as a sabotage test that patches `prepare()` to skip the guard and asserts TC-R3 would pass (the guard bypassed test would itself fail, confirming the guard is load-bearing).

**Acceptance Criteria**:
- All TC-R1 through TC-R5 pass.
- TC-R6 is recorded (inline comment or sabotage test).
- Tests use real git repos (no mocking of git operations for TC-R1 through TC-R4).

---

## T-07: Unit tests — `src/core/resume/__tests__/apply-canon.test.ts`

- [ ] **TC-U1**: `detectCanonDirtyPaths` returns `[]` when worktree is clean (mocked `git status` returns empty output).
- [ ] **TC-U2**: `detectCanonDirtyPaths` returns only the canon-path subset when multiple dirty paths are present (mocked `git status` returns a mix of protected and non-protected paths).
- [ ] **TC-U3**: `detectCanonDirtyPaths` returns `[]` when only non-protected-canon files are dirty.
- [ ] **TC-U4**: `detectCanonDirtyPaths` throws when `git status` exits non-zero（fail-closed — R2 を無条件保証にする。DESTROY: [] 縮退へ戻すと本 TC が fail）.
- [ ] **TC-U5**: `commitOperatorCanon` creates a commit with correct message using a real tmp git repo.
- [ ] **TC-U6**: `commitOperatorCanon` returns a non-empty OID string.
- [ ] **TC-U7**: `commitOperatorCanon` throws when `git add` returns non-zero (mocked spawnFn).

**Acceptance Criteria**:
- All unit tests pass.
- TC-U2 and TC-U3 together confirm that the intersection with `protectedCanonPaths(slug)` is the actual filter (not a substring match or path-prefix match).

---

## T-08: `typecheck && test` green

- [ ] Run `bun run typecheck` — zero type errors.
- [ ] Run `bun run test` — all tests pass (including existing tests that must not regress).

**Acceptance Criteria**:
- Both commands exit 0.
- No pre-existing test is broken by the changes.
