# Tasks: operator-commit-adoption

## T-01: Add shared egress resolution-options helper in `src/errors.ts`

- [ ] Add an exported function `egressResolutionOptions(slugLabel?: string): string`
      that returns the three operator-facing resolution options as formatted
      multi-line text. Default `slugLabel` to `"<slug>"`.
  - Option 1 (adopt): references `specrunner job resume <slugLabel> --adopt-commits`
    and states it records the commit(s) in the ledger to allow the push.
  - Option 2 (push): states the operator should push the commit(s) to origin so
    they leave the publish range.
  - Option 3 (drop): states the operator should remove/revert the commit(s)
    (e.g. `git reset` / `git revert`) so they leave the publish range.
- [ ] Update `egressUnknownCommitError(oid, branch)` (`src/errors.ts:474-480`) so
      its operator-facing text (the `hint` argument) includes the output of
      `egressResolutionOptions()` (default `<slug>` placeholder). Keep the detail
      message (`Egress backstop: unknown commit ${oid} in publish range ...`)
      unchanged. Do not change `ERROR_CODES.EGRESS_UNKNOWN_COMMIT`.

**Acceptance Criteria**:
- `egressResolutionOptions()` output contains the substring `--adopt-commits`,
  a reference to pushing to origin, and a reference to removing/reverting.
- `egressUnknownCommitError("abc", "b").hint` contains all three option
  references (via `egressResolutionOptions`).
- The `SpecRunnerError` produced by `egressUnknownCommitError` keeps `code ===
  "EGRESS_UNKNOWN_COMMIT"` and an unchanged detail message.

---

## T-02: Add `src/core/resume/adopt-commits.ts`

New leaf module mirroring `apply-canon.ts`, encapsulating publish-range
reconciliation and escalation-message construction.

- [ ] Create `src/core/resume/adopt-commits.ts`.
- [ ] Export `interface UnadoptedCommit { oid: string; shortSha: string;
      subject: string; author: string; paths: string[]; }`.
- [ ] Export `detectUnadoptedCommits(gitDir: string, ledger: readonly string[],
      spawnFn: SpawnFn): Promise<UnadoptedCommit[]>`:
  - Run `git rev-list HEAD --not --remotes=origin` in `gitDir` via
    `runSubprocess`. On non-zero exit, throw an `Error` whose message includes
    the exit code (e.g. `git rev-list failed (exit ${code}): ${stderr}`) so the
    caller can apply the `exit 128` carve-out.
  - Split stdout into trimmed non-empty OID lines. Build a `Set` from `ledger`.
    Keep only OIDs NOT in the set.
  - For each unknown OID, gather metadata best-effort via `gitExec` (returns null
    on failure; fall back gracefully so a missing field never aborts detection):
    - short SHA + subject + author: `git show -s --format=%h%x1f%s%x1f%an <oid>`
      (0x1f unit separator), split into the three fields; fall back to the OID /
      empty strings if unavailable.
    - changed paths: `git diff-tree --no-commit-id --name-only -r <oid>`, split
      into non-empty lines (empty array on failure).
  - Return the `UnadoptedCommit[]` (empty when the range holds no unknown OIDs).
- [ ] Export `buildAdoptEscalationMessage(slug: string, commits: UnadoptedCommit[]):
      string`:
  - A header line stating unknown (non-pipeline) commits were found in the push
    range and no step was run.
  - One block per commit listing its short SHA, subject, author, and changed
    paths.
  - The three resolution options via `egressResolutionOptions(slug)` (imported
    from `../../errors.js`), so the real slug is substituted.
- [ ] Imports: `runSubprocess`, `gitExec`, `type SpawnFn` from
      `../../util/git-exec.js`; `egressResolutionOptions` from `../../errors.js`.
- [ ] Do NOT import `defaultSpawnFn` — callers inject the spawn function.

**Acceptance Criteria**:
- `detectUnadoptedCommits` returns `[]` when every publish-range OID is in
  `ledger` (and when the range is empty).
- `detectUnadoptedCommits` returns only the OIDs absent from `ledger`, each with
  populated `shortSha` / `subject` / `author` / `paths` from a real tmp git repo.
- `detectUnadoptedCommits` throws when `git rev-list` exits non-zero, and the
  thrown message contains the exit code.
- `buildAdoptEscalationMessage("s", [commit])` contains the commit's short SHA
  and all three resolution options (including `--adopt-commits`).

---

## T-03: Thread `--adopt-commits` through the CLI layer

- [ ] `src/cli/command-registry.ts`: add `"adopt-commits": { type: "boolean" }`
      to the `job resume` subcommand `flags` map (alongside `apply-canon`).
- [ ] `src/cli/command-registry.ts`: pass `adoptCommits:
      !!parsed.flags["adopt-commits"]` inside the object handed to `runResume`.
- [ ] `src/cli/command-registry.ts`: add a one-line `--adopt-commits` description
      to the top-level `USAGE` string under the resume entry (e.g. "adopt
      operator-made commits into the egress ledger").
- [ ] `src/cli/resume.ts`: add `adoptCommits?: boolean` to `ResumeOptions`; forward
      `adoptCommits: options.adoptCommits` when constructing `ResumeCommand`.

**Acceptance Criteria**:
- `specrunner job resume <slug> --adopt-commits` parses without error.
- The resume handler passes `adoptCommits: true` to `runResume` when the flag is
  given, and falsey otherwise.
- All existing resume flags (`--apply-canon`, `--force`, `--from`, `--verbose`,
  `--quiet`, `--prompt`, `--prompt-file`, `--json`, `--no-worktree`, `--detach`)
  continue to work without regression.

---

## T-04: Add the adopt gate to `ResumeCommand.prepare()`

- [ ] `src/core/command/resume.ts`: add `adoptCommits?: boolean` to the local
      `ResumeOptions` interface.
- [ ] Import `detectUnadoptedCommits`, `buildAdoptEscalationMessage` from
      `../resume/adopt-commits.js`. (`defaultSpawnFn`, `appendSynthesizedCommit`,
      and the `JobStateStore` `runStore` reference are already available in
      `prepare()`.)
- [ ] Inside the existing `if (resolvedWorktreePath !== null && resolvedSlug !==
      null)` block, AFTER the apply-canon sub-block (and before / independent of
      `reconcileWorktreeArtifacts`), add the adopt gate:
  - Compute `ledger = updatedState.synthesizedCommits ?? []` (reads the
    post-apply-canon ledger).
  - Call `detectUnadoptedCommits(resolvedWorktreePath, ledger, defaultSpawnFn)`
    inside a try/catch. On catch: if the error message includes `exit 128`, treat
    as an empty range and continue (test/dev non-git dir carve-out, matching the
    apply-canon gate); otherwise `logError` + throw `PrepareError(1)` (fail-closed).
  - If the returned array is non-empty:
    - When `this.options.adoptCommits` is true: for each `UnadoptedCommit`, set
      `updatedState = appendSynthesizedCommit(updatedState, commit.oid)`; then
      persist. Persist must succeed to proceed — wrap `if (runStore) await
      runStore.persist(updatedState)` so that a persist throw OR a null
      `runStore` results in `PrepareError(1)` (pipeline not launched). `logInfo`
      the adopted short SHAs on success. No `git reset` / rollback (adoption
      makes no git change).
    - When `this.options.adoptCommits` is false: build `msg =
      buildAdoptEscalationMessage(resolvedSlug, commits)`; `logError(msg)` (or
      `logError` a summary + `stderrWrite(msg)`); throw `PrepareError(1)`.
- [ ] Ensure the ledger read happens after the apply-canon append so an
      `operator-apply` commit from the same resume is not re-flagged.

**Acceptance Criteria**:
- Unknown OID present, `--adopt-commits` absent → `prepare()` throws
  `PrepareError` with exit code 1; no step is started; the escalation output
  contains the unknown commit's short SHA and the three resolution options;
  `state.synthesizedCommits` is NOT changed.
- Unknown OID present, `--adopt-commits` given → each OID is appended to
  `state.synthesizedCommits`, the state is persisted, and `prepare()` resolves so
  the pipeline launches.
- Unknown OID present, `--adopt-commits` given, persist throws → `prepare()`
  throws `PrepareError(1)`; pipeline not launched.
- Empty publish range → gate is a no-op; `prepare()` resolves; ledger unchanged.
- `detectUnadoptedCommits` throwing with `exit 128` → treated as clean, resume
  continues; throwing with any other error → `prepare()` throws (fail-closed).
- `--apply-canon` given alone with a clean worktree + unknown committed OID → the
  apply-canon sub-block is a no-op and the adopt gate halts (no adopt flag);
  the OID is NOT appended.

---

## T-05: Unit tests — `src/core/resume/__tests__/adopt-commits.test.ts`

- [ ] TC-U1: `detectUnadoptedCommits` returns `[]` when all publish-range OIDs are
      in `ledger` (real tmp git repo + bare origin; ledger seeded with the range).
- [ ] TC-U2: `detectUnadoptedCommits` returns only the unknown OID(s) when a
      commit was added after the ledger snapshot (real tmp git repo). Assert
      `shortSha`, `subject`, `author`, and `paths` are populated from the commit.
- [ ] TC-U3: `detectUnadoptedCommits` returns `[]` when the publish range is empty
      (HEAD fully on origin).
- [ ] TC-U4: `detectUnadoptedCommits` throws when `git rev-list` exits non-zero
      (mocked `spawnFn` returning a non-zero exit); the message contains the exit
      code. (DESTROY note: degrading this to `return []` reintroduces the silent
      pass-through the gate removes.)
- [ ] TC-U5: `buildAdoptEscalationMessage(slug, [commit])` contains the commit's
      short SHA and all three resolution options (asserts `--adopt-commits`, an
      origin-push reference, and a remove/revert reference).

**Acceptance Criteria**:
- All unit tests pass; TC-U1/TC-U2/TC-U3 use a real tmp git repo (no git mocking
  for the detection assertions).

---

## T-06: Integration tests — `src/core/command/__tests__/resume-adopt-commits.test.ts`

Use the mock-harness pattern from `resume-apply-canon.test.ts` (mock
`../../resume/apply-canon.js`, `../../resume/adopt-commits.js`, the store,
`transitionJob`, `resolveJobStateBySlug`, logger, etc.). Access the protected
`prepare()` via the same type cast helper.

- [ ] TC-I1 (no flag halts before any step): `detectUnadoptedCommits` mocked to
      return one `UnadoptedCommit`; `applyCanon`/`adoptCommits` false. Assert
      `prepare()` throws (step not started). Verify the throw is the sole barrier —
      this maps to acceptance criterion "step が 1 つも実行されない".
- [ ] TC-I2 (escalation content): same setup; assert the `logError`/`stderrWrite`
      output contains the mocked commit's short SHA and all three resolution
      options (`--adopt-commits`, origin-push, remove/revert).
- [ ] TC-I3 (adopt appends + persists): `detectUnadoptedCommits` returns one
      commit; `adoptCommits: true`. Assert `runStore.persist` was called with a
      state whose `synthesizedCommits` includes the adopted OID, and `prepare()`
      resolves.
- [ ] TC-I4 (persist failure → no launch): `adoptCommits: true`; the mocked store
      `persist` rejects. Assert `prepare()` throws `PrepareError(1)` (pipeline not
      launched).
- [ ] TC-I5 (`--apply-canon` does not adopt): `detectCanonDirtyPaths` mocked to
      `[]` (clean worktree); `detectUnadoptedCommits` returns one commit;
      `applyCanon: true`, `adoptCommits: false`. Assert `prepare()` throws (adopt
      gate fires) and `commitOperatorCanon` was NOT called and the OID was NOT
      adopted — fixing that `--apply-canon` did not widen.
- [ ] TC-I6 (regression — empty range): `detectUnadoptedCommits` returns `[]`;
      no flags. Assert `prepare()` resolves with `startStep` set and
      `synthesizedCommits` unchanged.
- [ ] TC-I7 (exit-128 carve-out): `detectUnadoptedCommits` rejects with an error
      whose message includes `exit 128`; no flags. Assert `prepare()` resolves
      (treated as clean). Add a companion asserting a non-128 rejection makes
      `prepare()` throw (fail-closed).
- [ ] TC-I8 (destruction/sabotage record): inline comment documenting that
      removing the `commits.length > 0 && !adoptCommits` halt makes TC-I1 pass
      without throwing (the halt is load-bearing), plus an assertion that TC-I1's
      `prepare()` threw.

**Acceptance Criteria**:
- TC-I1–TC-I7 pass; TC-I8 recorded. The suite covers every request acceptance
  criterion at the `prepare()` boundary.

---

## T-07: CLI flag test — extend `src/cli/__tests__/command-registry-apply-canon.test.ts` (or a sibling)

- [ ] Assert `job resume <slug> --adopt-commits` passes `adoptCommits: true` to
      `runResume`, and falsey when absent.
- [ ] Assert combined flags `--adopt-commits --apply-canon --force` all reach
      `runResume` with the correct values (no regression to existing flag wiring).

**Acceptance Criteria**:
- The flag reaches `runResume` as `adoptCommits: true`; existing flag assertions
  remain green.

---

## T-08: Update `egressUnknownCommitError` message test coverage

- [ ] Add or extend a unit test asserting `egressUnknownCommitError` /
      `egressResolutionOptions` output contains the three resolution option
      references (`--adopt-commits`, origin-push, remove/revert). Place it beside
      existing error-factory tests, or in the `adopt-commits.test.ts` file if no
      errors test module exists.

**Acceptance Criteria**:
- The test fails if any of the three option references is dropped from the shared
  helper or the error hint.

---

## T-09: `typecheck && test` green

- [ ] Run `bun run typecheck` — zero type errors.
- [ ] Run `bun run test` — all tests pass, including pre-existing resume /
      egress / apply-canon suites (no regression).

**Acceptance Criteria**:
- Both commands exit 0.
- No pre-existing test is modified to accommodate the change on the empty-range
  normal path (the "publish range が空の通常経路で既存テスト無変更で green"
  criterion).
