# Design: archive-resume-when-unmerged

## Context

`job archive --with-merge` records the archive commit on the feature branch first, then waits for CI and merges the PR. If the post-record phase (CI wait, merge) fails and triggers escalation, the job is already in `archived` status — but rerunning the same command returns `No job found` because the archive/resume lookup excludes archived states by default.

Two call sites share the defect:

| File | Line | Call |
|------|------|------|
| `src/core/archive/orchestrator.ts` | 112 | `JobStateStore.list(cwd)` |
| `src/core/archive/merge-then-archive.ts` | 125 | `JobStateStore.list(cwd)` |

Both omit `opts.includeArchived`, so `changes/archive/*/state.json` is never read. The job is not found and the command fails before any resume logic runs.

A direct precedent exists: `JobStateStore.resolveId` (store.ts:380) already passes `{ includeArchived: true }` because "archived jobs remain resolvable by prefix." The archive/resume paths should follow the same convention.

Once the job is found, the existing control flow handles all cases without further changes:

- **orchestrator + archived job**: `TERMINAL_STATUSES.has(state.status)` is `true` → returns `Already finished (archived)` / exitCode 0 (idempotent).
- **merge-then-archive + archived + PR MERGED**: the branch at merge-then-archive.ts:178 (`prData.state === "MERGED" && jobStatus === "archived"`) is reached → calls `runPostMergeCleanup` → exitCode 0. This branch is currently dead code due to the lookup defect.
- **merge-then-archive + archived + PR unmerged**: job is resolved, PR is not MERGED, falls through to CI-wait → merge flow. `markJobArchived` inside `runArchiveOrchestrator` is idempotent (no-op when already archived).

`cancel`, `inbox`, and `exit-guard` list calls are intentionally unchanged — those callers exclude archived jobs on purpose (re-cancel, re-inbox, and running-state transitions of finished jobs are not desired behaviors).

## Goals / Non-Goals

**Goals**:
- Allow `job archive --with-merge <slug>` to resume when the job is `archived` but PR is not yet merged.
- Allow `job archive --with-merge <slug>` to complete post-merge cleanup when the job is `archived` and PR is already merged.
- Allow `job archive <slug>` (non-`--with-merge`) to return idempotently (exitCode 0) when the job is already `archived`.

**Non-Goals**:
- Introducing a new intermediate status (`awaiting-merge`, etc.) to defer the `archived` transition until after merge.
- Changing merge-gate logic, CI-none handling, or protected-paths behavior.
- Changing `cancel`, `inbox`, `exit-guard`, or `job ls` lookup behavior.
- Modifying worktree/branch teardown policy on merge failure.

## Decisions

### D1: Pass `{ includeArchived: true }` to the two archive/resume list calls

**Rationale**: The bug is a missing option on two `list()` calls. The rest of the control flow already handles all resulting states correctly (terminal short-circuit in orchestrator, MERGED+archived cleanup branch in merge-then-archive, idempotent `markJobArchived`). Fixing the lookup is the minimal, least-surprising change and follows the existing `resolveId` precedent.

**Alternatives considered**:
- **New intermediate status** (`awaiting-merge`): Would require lifecycle and all status-consumer changes across the codebase. Over-engineered for a simple lookup omission.
- **Separate resume command path**: Unnecessary indirection; the existing command already has the right branching logic once it can find the job.

### D2: Do not change `cancel`, `inbox`, `exit-guard` list calls

**Rationale**: Those callers intentionally exclude archived jobs. Including archived jobs there would permit re-cancel, re-inbox-pickup, or running-state transitions of finished jobs — all regressions. The defect is localized to the archive/resume code path only.

## Risks / Trade-offs

- **[Risk] Archive directory scan cost on archive/resume invocation**: `includeArchived: true` causes the archive directory to be scanned. For repos with many archived jobs this adds I/O on every `job archive` call. Mitigation: `job archive` is an infrequent user-facing command, not a hot inner loop. Acceptable cost.

## Open Questions

None. The fix is confirmed by the existing `resolveId` precedent and the request's architect evaluation.
