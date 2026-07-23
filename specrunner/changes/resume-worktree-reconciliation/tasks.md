# Tasks: resume-worktree-reconciliation

## T-01: Add `src/core/resume/reconcile-worktree.ts`

New module providing the pure classifier and the I/O orchestrator for worktree reconcile.

- [x] Create `src/core/resume/reconcile-worktree.ts`.
- [x] Export `interface ReconcileResult { reconciled: string[]; quarantineDir: string | null }`.
- [x] Export `isReconcilableArtifact(path: string, slug: string): boolean` (pure):
  - Let `folder = changeFolderPath(slug)`.
  - Return `false` when `path !== folder && !path.startsWith(folder + "/")` (outside the change
    folder — src/ etc.; guard against same-prefix-different-dir like `specrunner/changes/<slug>-x/...`).
  - Return `false` when `protectedCanonPaths(slug)` includes `path` (protected canon).
  - Return `false` when `pipelineManagedPaths(slug)` includes `path` (state journal / managed).
  - Otherwise return `true` (reconcilable pipeline-managed artifact).
- [x] Export `reconcileWorktreeArtifacts(slug: string, worktreePath: string, spawnFn: SpawnFn): Promise<ReconcileResult>`:
  - Run `git status --porcelain -z --no-renames` via `runSubprocess(spawnFn, "git", [...], { cwd: worktreePath })`
    inside a `try`. If the call rejects (spawn failure), OR `exitCode !== 0`, **return the no-op
    result** `{ reconciled: [], quarantineDir: null }` (D7: detection is best-effort — a
    non-existent / non-git worktree cannot hold git-tracked residue).
  - Parse the NUL-delimited output the same way as `getWorktreeChangedPaths`
    (`commit-push.ts`): split on `\0`, drop empties; for each entry `part` with `part.length >= 4`,
    take `x = part[0]`, `y = part[1]`, `filePath = part.slice(3)`.
  - Build the reconcilable list: entries whose `filePath` satisfies `isReconcilableArtifact(filePath, slug)`.
    Record each entry's removal kind: `untracked` when `x === "?" && y === "?"`; `staged-new` when
    `x === "A"`; otherwise `tracked`.
  - If the reconcilable list is empty → return `{ reconciled: [], quarantineDir: null }` (idempotent no-op).
  - **Quarantine-all first (D4)**: compute `quarantineDir = pathJoin(worktreePath, localSidecarDir(slug), "reconcile-" + Date.now())`;
    `await fsMkdir(quarantineDir, { recursive: true })`. For each reconcilable path, write an evidence
    file into `quarantineDir` (filename = sanitized path, e.g. replace `/` with `__`, plus `.md`).
    Evidence content MUST include the path, the removal kind, an ISO timestamp, and the residue itself:
    prefer `git diff HEAD -- <path>` (via `gitExec`) when non-empty; otherwise the raw current worktree
    file content (`fsReadFile`). **If any `mkdir` / `writeFile` throws, let it propagate (do NOT catch)** —
    nothing has been removed yet, so this is the fail-closed evidence-preserved stop.
  - **Remove-all second (D5), only after every quarantine succeeded**, split by removal kind
    (mirror `restoreViolatedPaths`):
    - `untracked` → `git clean -f -- <paths>`
    - `staged-new` → `git rm --cached -- <paths>` then `git clean -f -- <paths>`
    - `tracked` → `git checkout HEAD -- <paths>`
    Use `gitExecResult`; on `!ok || exitCode !== 0` throw an `Error` (fail-closed removal failure).
  - Return `{ reconciled: <reconcilable filePaths>, quarantineDir }`.
- [x] Imports:
  - `protectedCanonPaths` from `../step/write-scope.js`
  - `pipelineManagedPaths` from `../pipeline/round-git-scope.js`
  - `changeFolderPath`, `localSidecarDir` from `../../util/paths.js`
  - `runSubprocess`, `gitExec`, `gitExecResult`, `type SpawnFn` from `../../util/git-exec.js`
  - `mkdir`, `writeFile`, `readFile` from `node:fs/promises`; `join` from `node:path`
- [x] Do NOT import `defaultSpawnFn` — the caller injects it.
- [x] Do NOT modify `apply-canon.ts`, `write-scope.ts`, `round-git-scope.ts`, or `commit-push.ts`.

**Acceptance Criteria**:
- `isReconcilableArtifact` returns `true` only for change-folder paths that are neither in
  `protectedCanonPaths(slug)` nor in `pipelineManagedPaths(slug)`.
- `reconcileWorktreeArtifacts` returns `{ reconciled: [], quarantineDir: null }` for a clean worktree.
- `reconcileWorktreeArtifacts` returns the no-op result (does not throw) when `git status` cannot
  be read (spawn rejection or non-zero exit).
- On a worktree with reconcilable residue, every reconciled path is quarantined (evidence present)
  before any removal, and each path is removed by the kind-appropriate git command.
- When a quarantine write fails, `reconcileWorktreeArtifacts` throws and no residue path has been removed.

---

## T-02: Wire reconcile into `ResumeCommand.prepare()`

- [x] In `src/core/command/resume.ts`, inside the existing
  `if (resolvedWorktreePath !== null && resolvedSlug !== null) { ... }` block, **after** the
  apply-canon gate logic and **before** the `else if (this.options.applyCanon)` branch, add the
  reconcile call:
  ```
  let reconcileResult;
  try {
    reconcileResult = await reconcileWorktreeArtifacts(resolvedSlug, resolvedWorktreePath, defaultSpawnFn);
  } catch (err) {
    logError(`Failed to reconcile worktree residue: ${(err as Error).message}`);
    stderrWrite("Hint: interrupted-attempt residue was preserved and NOT removed. Check .specrunner/local/<slug>/ writability, then resume again.");
    throw new PrepareError(1, "Failed to reconcile worktree residue (fail-closed)");
  }
  if (reconcileResult.reconciled.length > 0) {
    logInfo(`[reconcile] quarantined + removed interrupted-attempt residue: ${reconcileResult.reconciled.join(", ")}` +
      (reconcileResult.quarantineDir ? ` — 退避先: ${reconcileResult.quarantineDir}` : ""));
  }
  ```
- [x] Import `reconcileWorktreeArtifacts` from `../resume/reconcile-worktree.js` (`defaultSpawnFn`,
  `logError`, `logInfo`, `stderrWrite`, and `PrepareError` are already in scope).
- [x] Do NOT change the apply-canon gate block, the `--no-worktree` warning branch, or any
  other part of `prepare()`.

**Acceptance Criteria**:
- Reconcile runs on the default resume path, the `--from` path, and the `--apply-canon` path
  (all reach the same worktree guard block; `--from` only changes `startStep`).
- When `reconcileWorktreeArtifacts` throws, `prepare()` throws `PrepareError` with exit code 1 and
  the step is not started.
- In `--no-worktree` mode (`resolvedWorktreePath === null`) reconcile is not called (same guard as
  the apply-canon gate).
- When the apply-canon gate fail-closes (dirty canon, no `--apply-canon`), `prepare()` throws before
  reconcile is reached.

---

## T-03: Document the recovery contract in `docs/operations.md`

- [x] In `docs/operations.md`, under the `## 障害への耐性` section, add a subsection titled
  `### halt → resume の回復契約` that documents, on one page, the classification × processing ×
  timing contract as a table with the three classes:
  - **protected canon** (`protectedCanonPaths(slug)`) → apply-canon gate (`--apply-canon` /
    fail-closed), before reconcile.
  - **pipeline-managed artifact** (change-folder path, not canon, not `pipelineManagedPaths`) →
    quarantine to `.specrunner/local/<slug>/` then remove; quarantine failure is fail-closed;
    after the apply-canon gate, before step start.
  - **non-managed path** (src/ etc., and the `pipelineManagedPaths` state journal) → no processing.
- [x] State explicitly that the state journal (`state.json` / `events.jsonl` / `usage.json`) is
  preserved because resume is actively writing it.
- [x] Keep it prose-minimal (docs/README.md placement principle: keep the file count minimal — add a
  section, do not create a new file).

**Acceptance Criteria**:
- `docs/operations.md` contains a `halt → resume の回復契約` subsection with a table naming all
  three classes and their processing.
- The subsection names `.specrunner/local/<slug>/` as the quarantine destination and states the
  fail-closed-on-quarantine-failure rule.

---

## T-04: Unit tests — `src/core/resume/__tests__/reconcile-worktree.test.ts`

Use the mocked `SpawnFn` harness pattern from `apply-canon.test.ts` for the orchestrator, and
direct calls for the pure classifier.

- [x] **TC-U1**: `isReconcilableArtifact("specrunner/changes/<slug>/spec-review-result-002.md", slug)` → `true`.
- [x] **TC-U2**: `isReconcilableArtifact(p, slug)` → `false` for every path in `protectedCanonPaths(slug)`.
- [x] **TC-U3**: `isReconcilableArtifact(p, slug)` → `false` for every path in `pipelineManagedPaths(slug)`
  (`state.json`, `events.jsonl`, `usage.json`, `bite-evidence-result.md`, `pr-create-result.md`).
- [x] **TC-U4**: `isReconcilableArtifact("src/foo.ts", slug)` → `false`.
- [x] **TC-U5**: `isReconcilableArtifact("specrunner/changes/<slug>-other/x.md", slug)` → `false`
  (same-prefix-different-directory is not under the change folder).
- [x] **TC-U6**: `reconcileWorktreeArtifacts` returns `{ reconciled: [], quarantineDir: null }` when the
  mocked `git status` returns empty output (clean worktree) — no quarantine/removal git calls made.
- [x] **TC-U7**: `reconcileWorktreeArtifacts` returns the no-op result (does NOT throw) when the mocked
  `git status` exits non-zero, and when the spawn rejects (D7 detection best-effort).

**Acceptance Criteria**:
- All unit tests pass.
- TC-U2 + TC-U3 + TC-U4 + TC-U5 together confirm the classifier is set-membership + change-folder
  containment, not a substring/prefix match.

---

## T-05: Integration test (real git repo) — `tests/resume-worktree-reconciliation-e2e.test.ts`

Use real git repos in `$TMPDIR` (no mocking of git operations), mirroring
`operator-canon-apply-on-resume-e2e.test.ts`.

- [x] **TC-R1 (封鎖 / journal-observed scenario)**: reconcile clears interrupted residue and the
  next step's write-set check passes.
  - Init a real repo; make an initial commit; create feature branch; commit a change folder with a
    prior `spec-review-result-001.md` (tracked, clean).
  - Leave an **untracked** residue `specrunner/changes/<slug>/spec-review-result-002.md` in the worktree.
  - Call `reconcileWorktreeArtifacts(slug, repoDir, defaultSpawnFn)`.
  - Assert `reconciled` contains `specrunner/changes/<slug>/spec-review-result-002.md`.
  - Assert the residue file no longer exists in the worktree, and a quarantine file with its content
    exists under `.specrunner/local/<slug>/reconcile-*/`.
  - Assert the tracked `spec-review-result-001.md` is untouched.
  - Walk the real halt path: from the post-reconcile `git status`, assert
    `findScopedCommitViolations(slug, <post-reconcile worktree paths>, <declared: spec-review-result-003.md>, pipelineManagedPaths(slug))`
    returns `[]` AND `findWriteScopeViolations("spec-review", slug, <post-reconcile worktree paths>, <declared>)`
    returns `[]` (the residue that previously halted is gone). Preferred: additionally drive a scoped
    `commitAndPush` for a spec-review step declaring iteration 003 and assert no `WRITE_SCOPE_VIOLATION`.
- [x] **TC-R2 (fail-closed on quarantine failure)**: with a reconcilable residue present, force the
  quarantine write to fail (e.g. pre-create `.specrunner/local/<slug>` as a regular **file** so
  `mkdir` under it fails). Assert `reconcileWorktreeArtifacts` throws AND the residue file is still
  present in the worktree (not removed).
- [x] **TC-R3 (idempotent no-op)**: a repo whose change folder is fully committed and clean.
  Call `reconcileWorktreeArtifacts` → assert `{ reconciled: [], quarantineDir: null }`, no new files
  under `.specrunner/local/<slug>/`, and `git status` is unchanged before/after.
- [x] **TC-R4 (state journal + non-managed preserved)**: worktree with (a) untracked residue under
  the change folder, (b) dirty `specrunner/changes/<slug>/state.json`, (c) dirty `src/foo.ts`.
  After reconcile: only (a) is removed; (b) and (c) remain dirty with unchanged content.
- [x] **TC-R5 (removal kinds)**: assert an untracked residue is removed via clean (absent afterward)
  and a tracked-modified non-canon change-folder artifact (e.g. `verification-result.md`) is restored
  to its HEAD content.

**Acceptance Criteria**:
- TC-R1 through TC-R5 pass using real git repos.
- TC-R1 walks the real misattribution path (the same `findScopedCommitViolations` /
  `findWriteScopeViolations` functions that produced the original halt).

---

## T-06: Integration test — `ResumeCommand.prepare()` reconcile wiring

Add `src/core/command/__tests__/resume-reconcile.test.ts` using the mock harness pattern from
`resume-apply-canon.test.ts` (mock `../../resume/reconcile-worktree.js`).

- [x] **TC-I1**: default resume (clean canon) calls `reconcileWorktreeArtifacts` with the resolved
  slug and worktree path.
- [x] **TC-I2**: `--from <step>` resume also calls `reconcileWorktreeArtifacts` (not bypassed).
- [x] **TC-I3**: `--apply-canon` with dirty canon commits canon (mocked) and then still calls
  `reconcileWorktreeArtifacts`.
- [x] **TC-I4**: when `reconcileWorktreeArtifacts` throws, `prepare()` throws `PrepareError` with
  exit code 1 and the step is not started.
- [x] **TC-I5**: `--no-worktree` mode (`resolvedWorktreePath` null) does NOT call
  `reconcileWorktreeArtifacts`.
- [x] **TC-I6**: dirty canon without `--apply-canon` throws at the apply-canon gate and
  `reconcileWorktreeArtifacts` is NOT called (canon gate precedence).
- [x] **TC-I7 (destruction confirmation)**: document inline that removing the reconcile call from
  `prepare()` reinstates the residue-misattribution halt (TC-R1 regresses). Optionally implement as
  a sabotage assertion.

**Acceptance Criteria**:
- TC-I1 through TC-I6 pass.
- TC-I7 is recorded (inline comment or sabotage test).

---

## T-07: Docs drift-guard test

Add a drift guard under `tests/unit/docs/` (e.g. `operations-recovery-contract.test.ts`) that reads
`docs/operations.md` and asserts the recovery-contract subsection is present.

- [x] Assert the file contains the `halt → resume の回復契約` heading.
- [x] Assert it names all three classes (protected canon, pipeline-managed artifact, non-managed path)
  and the `.specrunner/local/` quarantine destination.

**Acceptance Criteria**:
- The test fails if the recovery-contract subsection or any of the three class names is removed
  (making the docs acceptance criterion a tooth).

---

## T-08: Existing apply-canon tests remain green unchanged

- [x] Run `src/core/resume/__tests__/apply-canon.test.ts`,
  `src/core/command/__tests__/resume-apply-canon.test.ts`, and
  `tests/operator-canon-apply-on-resume-e2e.test.ts` **without modification** and confirm they pass
  (the apply-canon gate is unchanged; reconcile no-ops on the fake worktree paths those tests use, per D7).

**Acceptance Criteria**:
- All pre-existing apply-canon tests pass with zero edits.

---

## T-09: `typecheck && test` green

- [x] Run `bun run typecheck` — zero type errors.
- [x] Run `bun run test` — all tests pass (no regression in existing tests).

**Acceptance Criteria**:
- Both commands exit 0.
