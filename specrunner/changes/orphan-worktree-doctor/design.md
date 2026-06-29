# Design: Detect and clean state-less orphan worktrees

## Context

Each local-runtime job runs inside a dedicated git worktree at
`<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId8>/`, created by
`WorktreeManager.create` (`src/core/worktree/manager.ts`, `buildWorktreePath`).
The worktree and its feature branch are created **before** the job's first state
persist and liveness sidecar write:

- `src/core/runtime/local.ts` — `manager.create(...)` runs first, then the
  `bootstrapState` persist and `writeLivenessSidecar(...)` run afterwards.

If the process dies in that window, the worktree and branch exist but there is
**no job state and no sidecar**. This "state-less orphan worktree" cannot be
cleaned by existing tooling:

- `job cancel <jobId>` resolves the target through `loadStateByJobId`
  (`src/core/job-access/load-by-job-id.ts`); with no state it cannot resolve the
  job at all.
- The existing `orphan-sidecars` doctor check
  (`src/core/doctor/checks/storage/orphan-sidecars.ts`) only inspects
  `.specrunner/local/<slug>/` sidecar directories; it never looks at worktrees,
  and a state-less orphan has no sidecar to begin with.

Today the operator must manually `git worktree remove` / `git branch -D`. This
has happened repeatedly in real use.

Key existing facts this design relies on:

- `JobStateStore.list(repoRoot, { includeArchived: true })`
  (`src/store/job-state-store.ts`) enumerates known job states across the main
  checkout, archived folders, local worktrees, sidecar supplements, and managed
  markers. A worktree that has its own `state.json` (the healthy case) is
  therefore *included* in this list; a truly state-less worktree is *not*.
- `getJobSlug(state)` (`src/state/job-slug.ts`) + `state.jobId.slice(0, 8)`
  reproduce the exact `<slug>-<jobId8>` directory name that `buildWorktreePath`
  produces. `job cancel` already depends on this same invariant
  (`resolveWorktreePathForJob` in `src/core/cancel/runner.ts`).
- Doctor checks are read-only diagnostics assembled in
  `src/core/doctor/checks/index.ts` and executed by `runChecks`
  (`src/core/doctor/runner.ts`), which converts thrown errors into `fail`
  results.
- `job` subcommands are registered in `src/cli/command-registry.ts`;
  worktree-sensitive subcommands are listed in `job.guardedSubcommands` and are
  rejected when invoked from inside a worktree (`bin/specrunner.ts`).

## Goals / Non-Goals

**Goals**:

- Detect state-less orphan worktrees through `specrunner doctor`, read-only,
  mirroring the `orphan-sidecars` philosophy (warn + actionable hint, never
  mutate).
- Provide an explicit, guarded `job prune` command that removes orphan worktrees
  and their local branches. Default is **dry-run** (list only); actual deletion
  requires an explicit `--force`. Deletion is best-effort and idempotent.
- Protect against data loss: skip (and warn about) any orphan worktree that has
  uncommitted changes or unpushed commits, even under `--force`.
- Share one detection implementation between the doctor check and `job prune`.

**Non-Goals**:

- Closing the orphan window itself (atomically persisting state/sidecar before
  worktree creation in `setupWorkspace`). The window is small; this request
  treats the symptom (existing orphans), not the cause.
- Changing `job ls` visibility timing.
- Any flag-less / automatic pruning. Destructive actions require an explicit
  flag.
- Managed-runtime-specific orphans (local runtime only).
- Cleaning orphan **sidecars** — that remains the `orphan-sidecars` check's
  responsibility, untouched by this change.

## Decisions

### D1: Detection = worktree directory with no non-terminal known job state

A worktree under `.git/specrunner-worktrees/` is classified as an **orphan**
when its `<slug>-<jobId8>` directory name does **not** map to any known job state
whose status is *non-terminal* (`running`, `awaiting-resume`,
`awaiting-archive`, `failed`, `terminated`).

The protected (non-orphan) set is built from
`JobStateStore.list(repoRoot, { includeArchived: true })`: for each state with a
non-terminal status, compute `${getJobSlug(state)}-${state.jobId.slice(0, 8)}`
and add it to the set. A worktree directory whose basename is in this set is
healthy (handled by `job cancel` / `job resume` / `job archive`); everything else
is an orphan.

This single rule covers both target cases:

- **State-less orphan** (the primary symptom): no state exists anywhere, so the
  directory name is absent from the protected set.
- **Terminal leftover**: a worktree left behind for an `archived`/`canceled` job
  (cleanup did not complete). Such a job is terminal, so it is not in the
  protected set, and neither `job cancel` (rejects `archived`) nor `job archive`
  (cannot re-archive) can clean it — `job prune` is the correct owner.

Healthy non-terminal jobs are excluded because their worktrees carry their own
`state.json`, which `JobStateStore.list` discovers (its section 2 scans
`.git/specrunner-worktrees/*/specrunner/changes/*/state.json`).

This is the exact mirror of the `orphan-sidecars` non-terminal/terminal
semantics, keeping the two checks conceptually paired.

**Rationale**: reusing `JobStateStore.list` (rather than re-deriving "is this job
active") means the orphan rule automatically tracks every present and future
state location the store already knows about. Mapping by `getJobSlug` +
`jobId8` reuses the invariant `job cancel` already trusts, so no new fragile path
parsing is introduced (slugs may contain hyphens, so parsing the directory name
back into slug + id would be ambiguous).

**Alternatives considered**:

- *Parse the directory name `<slug>-<jobId8>` to recover slug + id, then probe
  for state.* Rejected: slugs contain hyphens; the split is ambiguous, and it
  reimplements state lookup that `JobStateStore.list` already centralizes.
- *Treat any worktree not currently `running` as orphan.* Rejected: `failed` /
  `terminated` / `awaiting-*` jobs are legitimately resolvable through
  `cancel`/`resume`/`archive`; pruning them would steal work from those flows.

### D2: Enumerate worktrees via `git worktree list --porcelain`

The set of candidate worktrees is taken from `git worktree list --porcelain`,
filtered to entries whose path is under `<repoRoot>/.git/specrunner-worktrees/`.
This yields both the absolute path and the authoritative branch name for each
worktree (needed for the report and for `git branch -D` during prune).

**Rationale**: the crash scenario leaves a fully **registered** worktree (the
`git worktree add` completed before the process died), so `git worktree list` is
the authoritative, branch-aware enumeration. It also avoids misclassifying a
stray non-worktree directory and provides the branch name without a second git
call.

**Alternatives considered**:

- *`readdir` of `.git/specrunner-worktrees/` plus a separate branch lookup per
  entry.* Rejected as the primary mechanism: it needs an extra git call per
  directory to recover the branch and cannot tell a registered worktree from a
  leftover directory. (Unregistered-but-on-disk directories are treated as an
  edge case — see Risks.)

### D3: Cleanup is a dedicated, guarded `job prune` command (dry-run by default)

Cleanup lives in a new `job prune` command, not in `doctor`.

- Default behavior: **dry-run** — list the orphan worktrees (path + branch) and
  whether each would be deleted or skipped; mutate nothing.
- `--force`: perform deletion. For each deletable orphan, remove the worktree
  (`WorktreeManager.remove`, i.e. `git worktree remove --force` + `rm -rf`) and
  delete the **local** branch (`git branch -D`). The remote branch is left
  untouched (orphan branches were typically never pushed; scope is local).
- Best-effort + idempotent: individual failures become warnings; a re-run after
  a successful prune finds no orphans and is a no-op.

`--force` only flips dry-run → real deletion. It does **not** override the
work-protection guard in D4.

**Rationale**: `doctor` is, by contract, entirely read-only (diagnosis only).
Introducing a `--fix` mode would widen that contract. Worktrees live in the
`job` namespace, so `job prune` is the discoverable home. Dry-run-by-default with
an explicit `--force` matches the safety expectation for a destructive operation
(cf. `git clean -f`).

**Alternatives considered**:

- *`doctor --fix`.* Rejected: breaks doctor's read-only contract.
- *Extend `job cancel`.* Rejected: `cancel` is built around resolving a `jobId`
  to a `state`, which a state-less orphan does not have.

`job prune` is registered as a **guarded** subcommand (added to
`job.guardedSubcommands`), so it must run from the main checkout — you cannot
prune the worktree you are standing in, and the scan/deletes target the
repo-root `.git/specrunner-worktrees/`.

### D4: Work-protection guard skips dirty / unpushed worktrees (not overridable)

Before deleting an orphan, inspect it for unsaved work. A worktree is
**protected** (skipped + warned, even under `--force`) when either:

- `git -C <worktree> status --porcelain` produces any output (uncommitted or
  untracked changes), or
- `git -C <worktree> rev-list --count HEAD --not --remotes` returns a non-zero
  count (HEAD has commits not reachable from any remote-tracking ref — i.e.
  unpushed local commits).

**Rationale**: orphans are usually empty, but a destructive bulk delete must
never silently discard work. `rev-list --count HEAD --not --remotes` returns `0`
for the common empty orphan whose HEAD equals an already-pushed base tip (so it
is deletable), and `> 0` whenever local-only commits exist.

**Alternatives considered**:

- *Compare against a recorded base ref.* Rejected: a state-less orphan has no
  recorded base; remote-reachability needs no per-job metadata.
- *Allow `--force` to override the guard.* Rejected by the acceptance criteria —
  the guard is a hard safety floor independent of `--force`.

### D5: One shared detection module

The enumeration + classification (D1/D2) and the work inspection (D4) live in a
single module under `src/core/worktree/` (alongside `manager.ts`). Both the
`orphan-worktrees` doctor check and the `job prune` runner import it. The module
takes injected dependencies (a `spawn` function and a `listStates` function
defaulting to `JobStateStore.list`) so its logic is unit-testable with mocks,
while the doctor check and the prune CLI wire in the real implementations.

**Rationale**: requirement #4 forbids double-implementing detection. A shared,
dependency-injected module keeps a single source of truth and stays testable
without touching the real filesystem for the core logic.

## Risks / Trade-offs

- [Risk] **Repos without remote-tracking refs**: `rev-list HEAD --not --remotes`
  treats *all* of HEAD's history as unpushed when no remote refs exist, so every
  orphan is conservatively skipped. → Mitigation: accept the conservative
  behavior (it only ever *protects*, never destroys). The normal spec-runner
  flow always has an `origin`, so empty orphans prune correctly. Documented as a
  known limitation.
- [Risk] **Stray on-disk directory not registered as a git worktree** (e.g.
  partial earlier removal). → Mitigation: out of primary scope; `git worktree
  list` will not surface it. `job prune` runs `git worktree prune` to clear stale
  refs as a best-effort sweep, but reclaiming an unregistered stray directory is
  not guaranteed and is left for a follow-up if it proves common.
- [Risk] **`getJobSlug` mismatch** between the slug used at create time and the
  slug derived from state. → Mitigation: this is the same invariant `job cancel`
  already relies on; no new assumption is introduced.
- [Risk] **Doctor check raising would surface as a `fail`** (runner converts
  throws to `fail`), changing doctor's exit code. → Mitigation: the check is
  defensive — missing base directory, non-git repo, or git errors resolve to
  `pass`; it only ever returns `pass` or `warn`, never `fail`.

## Open Questions

- None blocking. (`--json` output for `job prune` and reclaiming unregistered
  stray directories are deliberately deferred as possible follow-ups.)
