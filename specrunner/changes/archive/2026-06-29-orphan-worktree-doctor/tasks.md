# Tasks: Detect and clean state-less orphan worktrees

## T-01: Shared orphan-worktree detection module

- [x] Create `src/core/worktree/orphan.ts` as the single source of truth for
      orphan detection and work inspection (imported by both the doctor check
      and the prune runner).
- [x] Define and export types:
  - `OrphanWorktree { worktreePath: string; dirName: string; branch: string | null }`
  - `WorkInspection { hasWork: boolean; reasons: string[] }` (reasons describe
    uncommitted vs unpushed)
- [x] Define a non-terminal status set
      (`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`).
      Reuse / align with the set already used by
      `src/core/doctor/checks/storage/orphan-sidecars.ts` (extract a shared
      constant if convenient; do not change orphan-sidecars behavior).
- [x] Implement `scanOrphanWorktrees(deps)` where `deps` injects:
  - `repoRoot: string`
  - `spawn: SpawnFn` (from `src/util/spawn.ts`)
  - `listStates?: () => Promise<JobState[]>` defaulting to
    `JobStateStore.list(repoRoot, { includeArchived: true })`
  - Behavior:
    1. Enumerate worktrees via `git worktree list --porcelain` (parse `worktree`
       and `branch` lines); keep only paths under
       `<repoRoot>/.git/specrunner-worktrees/`.
    2. Build the protected set: for each known state whose status is non-terminal,
       add `${getJobSlug(state)}-${state.jobId.slice(0, 8)}` (use
       `getJobSlug` from `src/state/job-slug.ts`).
    3. Return `OrphanWorktree[]` for every enumerated worktree whose directory
       basename is NOT in the protected set. `branch` comes from the porcelain
       output (strip the `refs/heads/` prefix); `null` when detached/absent.
  - Must be defensive: a missing `.git/specrunner-worktrees/` base or a failing
    `git worktree list` resolves to an empty list (never throw for "nothing to
    scan").
- [x] Implement `inspectWorktreeWork(worktreePath, spawn): Promise<WorkInspection>`:
  - `hasWork` is true when `git -C <worktreePath> status --porcelain` is
    non-empty (reason: uncommitted/untracked changes) OR
    `git -C <worktreePath> rev-list --count HEAD --not --remotes` is `> 0`
    (reason: unpushed commits).
  - On a git error while inspecting, treat as `hasWork: true` (fail safe: never
    delete when work-state is unknown) with an explanatory reason.

**Acceptance Criteria**:
- `scanOrphanWorktrees` returns an entry for a worktree with no non-terminal
  state, and omits a worktree mapped to a non-terminal state — verified with a
  mocked `spawn` and an injected `listStates`.
- `scanOrphanWorktrees` returns `[]` when the base dir is absent or
  `git worktree list` fails.
- `inspectWorktreeWork` returns `hasWork: true` for non-empty
  `status --porcelain`, `hasWork: true` for `rev-list --count … > 0`, and
  `hasWork: false` only when both are clean — verified with a mocked `spawn`.
- `bun test`, `typecheck`, and `bun run build` pass for the new module.

## T-02: `orphan-worktrees` doctor check (read-only)

- [x] Create `src/core/doctor/checks/storage/orphan-worktrees.ts` exporting
      `orphanWorktreesCheck: DoctorCheck` (`name: "orphan-worktrees"`,
      `category: "storage"`, `required: false`).
- [x] In `check(ctx)`, call `scanOrphanWorktrees` (from T-01) with
      `repoRoot = ctx.cwd`, the real `spawnCommand`, and the default
      `JobStateStore.list`-backed `listStates`.
- [x] Result mapping:
  - No orphans → `{ status: "pass", message: "No orphan worktrees found" }`.
  - Orphans → `{ status: "warn", message: "Found N orphan worktree(s) ...",
    details: [<paths>], hint: "Remove orphan worktrees with:\n  specrunner job prune --force" }`.
  - Never return `fail`: any scan error resolves to `pass` (do not change
    doctor's exit-code semantics).
- [x] Register the check in `src/core/doctor/checks/index.ts`:
  - Add the import.
  - Append `orphanWorktreesCheck` to `commonChecks` (after `orphanSidecarsCheck`).
  - Add it to the re-export block.
  - Update the leading count comment if present.
- [x] Do NOT modify `orphan-sidecars.ts`, `managedChecks`, or `localChecks`.

**Acceptance Criteria**:
- A fixture/integration test (real temp git repo): a worktree created under
  `.git/specrunner-worktrees/` with no persisted state is reported `warn` with
  its path in `details`.
- A worktree mapped to a non-terminal job state is NOT reported (`pass`).
- The check performs no deletion (read-only): assert no `git worktree remove` /
  `git branch -D` is invoked (e.g. via spawn spy in a unit-style variant).
- Existing `orphan-sidecars` tests remain green and unchanged.
- `orphan-worktrees` appears in `specrunner doctor` output (common checks).

## T-03: `job prune` core runner

- [x] Create `src/core/prune/runner.ts` exporting
      `pruneOrphanWorktrees(opts): Promise<PruneResult>` where:
  - `opts = { force: boolean; deps: { repoRoot, spawn, worktreeManager, listStates? } }`
    (mirror the dependency-injection shape of `src/core/cancel/runner.ts`).
  - `PruneResult = { exitCode: 0 | 1; message?: string; info?: string[]; warnings?: string[] }`
    (same shape used by `CancelResult`).
- [x] Behavior:
  1. `scanOrphanWorktrees(...)` to get orphans.
  2. (best-effort) run `worktreeManager.prune(repoRoot)` to clear stale refs.
  3. For each orphan, call `inspectWorktreeWork`. If `hasWork` → add a warning
     ("skipped: unsaved/unpushed work") and skip (even when `force` is true).
  4. Dry-run (`force` false): add an info line per deletable orphan describing
     what *would* be removed (path + branch); delete nothing.
  5. `--force`: for each deletable orphan, `worktreeManager.remove(path, repoRoot)`
     then `git branch -D <branch>` (best-effort; failures → warnings). Skip the
     branch delete when `branch` is `null`.
  6. No orphans → success message "No orphan worktrees found".
  7. Idempotent: a re-run after a successful prune finds no orphans and removes
     nothing.
- [x] `exitCode` is `0` on success/no-op; reserve `1` for hard failures (best-
      effort cleanup warnings stay `0`, matching `cancel` semantics).

**Acceptance Criteria**:
- Dry-run lists orphans and deletes nothing (assert `worktreeManager.remove` and
  `git branch -D` are not called).
- `--force` removes the worktree and deletes the local branch for a clean orphan.
- A second `--force` run is a no-op (no orphans, no removal calls).
- An orphan with uncommitted changes OR unpushed commits is skipped under
  `--force`, with a warning; its worktree is not removed.
- `bun test`, `typecheck`, `bun run build` pass.

## T-04: `job prune` CLI wiring

- [x] Create `src/cli/prune.ts` exporting `runPrune(opts: { force: boolean }): Promise<number>`:
  - Resolve repo root (`resolveRepoRootOrFail`), build `worktreeManager`
    (`createWorktreeManager()`) and `spawnCommand`, call `pruneOrphanWorktrees`,
    and print results (info → stdout, warnings → stderr, message per exit code),
    mirroring `writeResult` in `src/cli/cancel.ts`. Return the runner exit code.
- [x] Register the command in `src/cli/command-registry.ts`:
  - Add a `prune` entry under `job.subcommands` with a single boolean flag
    `force`.
  - Add `"prune"` to `job.guardedSubcommands` so it is rejected from inside a
    worktree.
  - Add a `PRUNE_USAGE` constant and attach it as the subcommand `usage`.
  - Add a `job prune` line to the `Job commands:` section of the top-level
    `USAGE` help text.
- [x] Handler wires `--force` into `runPrune` and `process.exit`s on the returned
      code (follow the `cancel` handler's error handling for `SpecRunnerError`).

**Acceptance Criteria**:
- `specrunner job prune --help` prints `PRUNE_USAGE`.
- `specrunner job prune` from inside a worktree exits with the arg-error code and
  the worktree-guard message (guarded subcommand).
- `specrunner job prune` (no flag) runs dry-run; `--force` performs deletion.
- `job prune` appears in `specrunner --help` job command list.
- `bun test`, `typecheck`, `bun run build` pass.

## T-05: Tests and full verification

- [x] Unit tests for the shared module (T-01): `scanOrphanWorktrees`
      classification (orphan vs non-terminal-mapped, empty-base) and
      `inspectWorktreeWork` (uncommitted / unpushed / clean) using mocked
      `spawn` + injected `listStates`.
- [x] Doctor check tests (T-02): fixture/integration proving the orphan-report
      and non-terminal-exclusion scenarios, plus read-only assertion.
- [x] Prune runner tests (T-03): dry-run-no-delete, force-delete, idempotent
      re-run, and work-guard-skip-under-force.
- [x] Confirm existing doctor/cancel tests are unchanged and green.
- [x] Run the full gate: `bun test` green, `typecheck` green, `bun run build`
      succeeds.

**Acceptance Criteria**:
- All acceptance criteria from the request are covered by the tests above:
  - state-less worktree reported as orphan by doctor (fixture);
  - non-terminal job worktree not reported;
  - `job prune` dry-run lists without deleting, `--force` deletes
    worktree+branch, re-run is a no-op;
  - uncommitted/unpushed worktree skipped under `--force` with a warning;
  - existing doctor checks unchanged;
  - existing tests untouched; `bun test` / `typecheck` / `bun run build` all
    green.
