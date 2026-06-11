# Design: job-list-archive-skip

## Context

`JobStateStore.list` unconditionally scans `specrunner/changes/archive/` (section 1b), loading every archived job's `state.json + events.jsonl` (journal projection re-construction) before filtering. With 326 archived entries today at ~41 MB, a `job ls` call with zero visible results takes 2.5 s. Archive grows monotonically (~6 jobs/day), so the cost is unbounded.

`inbox run` (5-min cron) calls `JobStateStore.list` twice per tick and never consults archived state, yet pays the same scan cost each time.

The filter — status-based exclusion of archived jobs — lives in the display layer (`ps.ts`), downstream of the IO.

## Goals / Non-Goals

**Goals**:
- Skip the archive directory scan when archived states are not needed
- Default to skip-archive; opt-in required for callers that need archived state
- `job ls` (default), `--active`, and `inbox tick` pay O(active jobs) cost regardless of archive size
- `--all` / `--status archived` callers continue to see archived jobs exactly as before

**Non-Goals**:
- Archive retention / git clone size
- `.specrunner/local/` sidecar cleanup
- jobId → slug local-job-index indexing

## Decisions

### D1: Add `includeArchived` option to `JobStateStore.list`

Add `opts?: { includeArchived?: boolean }` parameter. Default: `false` — section 1b (archive directory scan, `src/store/job-state-store.ts:237-258`) is skipped entirely when the flag is absent or false.

**Rationale**: Single-location control; backwards-compatible (existing callers pass nothing → get the faster default); no API surface multiplication.

**Alternatives considered**:
- Separate `listArchived` method: doubles the API surface; callers that need merged results must concatenate manually.
- Filter at callers before IO: does not eliminate the scan cost — only hides it.

### D2: Caller audit — opt-in list

Callers that set `includeArchived: true`:

| Caller | Reason |
|---|---|
| `src/cli/ps.ts` | Only when `opts.all === true` or `opts.status === 'archived'` |
| `src/cli/job-show.ts` | User may look up an archived job by slug |
| `JobStateStore.resolveId` (internal) | User may pass an archived job's ID prefix |

All other callers use the default (no opt-in):

| Caller | Reason archived is unnecessary |
|---|---|
| `src/core/inbox/run-inbox.ts` (×2) | Reconcile operates only on active/awaiting jobs |
| `src/core/lifecycle/exit-guard.ts` | Transitions only running jobs to awaiting-resume |
| `src/core/cancel/runner.ts` | `BULK_CLEANUP_STATUSES = {failed, terminated, canceled}` — none are archived |
| `src/core/finish/resolve-target.ts` | Resolves active job targets |
| `src/core/resume/resolve-job.ts` | Resolves awaiting-resume jobs |
| `src/cli/archive.ts` | Finds active job to archive |
| `src/core/archive/orchestrator.ts` | Same |
| `src/core/archive/merge-then-archive.ts` | Same |

**Rationale**: Archived jobs are terminal; they cannot transition, be resumed, cancelled, or reconciled. The only operations that legitimately need them are display (`ps --all`, `job show`) and ID resolution (`resolveId`).

### D3: Archive-skip verification test

Add a dedicated test that:
1. Creates a temporary directory with `specrunner/changes/archive/` containing multiple stub subdirectories
2. Spies on `fs.readdir` to count calls
3. Calls `JobStateStore.list(repoRoot)` (default, no `includeArchived`)
4. Asserts the spy was never called with a path under `archive`
5. Calls `JobStateStore.list(repoRoot, { includeArchived: true })` and asserts the archive path was read

## Risks / Trade-offs

- [Risk] `resolveId` still pays the archive scan cost when resolving a short prefix. Mitigation: `resolveId` is called only on explicit user commands, not in automated loops — acceptable latency.
- [Risk] Future callers that need archived state may forget `includeArchived: true`. Mitigation: the TypeScript signature is self-documenting; the default is safe (fast, correct for all non-display paths).

## Open Questions

None.
