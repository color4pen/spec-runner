# Scale-Tolerance Review: split-reopen-from-resume

**Reviewer**: scale-tolerance  
**Iteration**: 1  
**Date**: 2026-08-27

---

## Purpose

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Scope

Changed files examined (scale-relevant paths):

| File | Scale-Relevant? | Examined |
|------|-----------------|----------|
| `src/core/command/reopen.ts` | ✅ Primary target | ✅ |
| `src/state/lifecycle.ts` | ✅ Transition table | ✅ |
| `src/store/job-state-store.ts` | ✅ `list()` entrypoint | ✅ |
| `src/store/job-catalog.ts` | ✅ Archive scan logic | ✅ |
| `src/store/event-journal.ts` | ✅ Journal append | ✅ |
| `src/store/job-journal.ts` | ✅ `appendOperatorEvent` impl | ✅ |
| `src/core/resume/resolve-job.ts` | ✅ Called by reopen | ✅ |
| `src/core/job-access/resolve-state-store.ts` | ✅ Called by reopen | ✅ |
| `src/core/job-access/load-by-job-id.ts` | ✅ Called by reopen | ✅ |
| `src/cli/reopen.ts` | Low (wrapper only) | ✅ |
| `tests/unit/workflow/specrunner-dispatch.test.ts` | No scale ops | ✅ |
| `.github/workflows/specrunner-dispatch.yml` | ✅ New 2-step dispatch | ✅ |

---

## Happy-Path Cost Analysis

`ReopenCommand.execute()` on a well-formed `awaiting-archive` job with an OPEN PR:

| Operation | Complexity | Scales with |
|---|---|---|
| `detectSpecrunnerWorktree(cwd)` | O(1) | — |
| `resolveJobStateBySlug(slug, cwd)` → `list({ includeArchived: false })` | O(active\_jobs) | active change dirs |
| `getPullRequest(owner, name, number)` | O(1) API call | — |
| `resolveStateStoreByJobId(cwd, jobId)` | O(1) | sidecar index lookup |
| `store.appendOperatorEvent(record)` | O(1) | — (single `appendFile`) |
| `transitionJob(state, "awaiting-resume", ctx, opts)` | O(|history|) | per-job history, capped |
| `store.persist(transitioned)` | O(delta) | delta-only journal append |

**Happy-path verdict**: No proportional-growth regression. The command is lighter than the original:

- Removed: `resolveRepoRoot()`, `loadConfig()`, `resolveLivenessWorktreePath()`, workspace setup, keepAlive, pipeline execution.
- Retained: single slug-based `list({ includeArchived: false })` (O(active\_jobs)) — same as every other lifecycle command.

---

## Error-Path Cost Analysis

When `resolveJobStateBySlug` returns `null` (slug not found among non-terminal jobs):

```typescript
// src/core/command/reopen.ts:80
const allStates = await JobStateStore.list(cwd, { includeArchived: true });
const terminalForSlug = allStates.filter((s) => getJobSlug(s) === this.slug);
```

This is **O(active\_jobs + archive\_size)** — proportional to the monotonically growing archive.

However:

1. **Pre-existing**: Identical code was present in the original `prepare()` method on `main` branch (`git show main:src/core/command/reopen.ts`). This PR does not introduce this pattern.
2. **Error-path only**: This scan fires only when no non-terminal job matches the slug — i.e., after the primary lookup already failed.
3. **Purpose**: Distinguishes "archived/canceled job" (return 1 with helpful status message) from "not found" (fall through to `resolveId`).

If `terminalForSlug.length === 0`, the code falls to `JobStateStore.resolveId`, which internally also does `list({ includeArchived: true })` (second O(archive) scan). Again, pre-existing behavior preserved unchanged.

---

## New Additions from This PR

### 1. `appendOperatorEvent` (new in reopen, but previously existed in codebase)

The operator event journal record for `action=reopen` is now appended before the state transition:

```typescript
await store.appendOperatorEvent({
  type: "operator-event",
  action: "reopen",
  reason: this.options.reason,
  ts: new Date().toISOString(),
});
```

- **Cost**: O(1) — single `fs.appendFile` call.
- **Journal growth**: One record appended per `job reopen` invocation.
- **Fold impact**: `fold()` processes all journal records on next load. For a job reopened N times, `operatorEvents` array grows by N. However, N is bounded by the number of complete pipeline cycles for that job (reopen requires `awaiting-archive`, which requires a full pipeline run first). This is operationally bounded and is not the monotonic archive concern.

### 2. Two-step Actions workflow dispatch

The `action=reopen` branch now calls `job reopen` then `job resume` sequentially:

```bash
bun ./bin/specrunner.ts job reopen "$SLUG" --reason "$REASON"
bun ./bin/specrunner.ts job resume "$SLUG" --from "$FROM" ...
```

- **Cost**: Two CLI invocations vs. one — O(1) additional overhead.
- `job reopen` performs only the lightweight lifecycle transition; the per-command archive scan pattern is unchanged.
- `job resume` is the existing pipeline entry point, unchanged by this PR.

### 3. Transition target: `awaiting-resume` instead of `running`

`REOPEN_TRANSITIONS["awaiting-archive"]` now maps to `new Set(["awaiting-resume"])`.

- **Cost**: O(1) Map lookup in `transitionJob`. No iterative scan.
- `canTransition` is O(1). `VALID_TRANSITIONS` and `REOPEN_TRANSITIONS` are in-memory constants.

---

## What Was Removed (Scale Positive)

This PR removes the following scale-heavy operations from `job reopen`:

| Removed Operation | Former Scale |
|---|---|
| `resolveRepoRoot(cwd)` | O(dir traversal) |
| `loadConfig(repoRoot)` | O(1) + config I/O |
| `resolveLivenessWorktreePath(...)` | sidecar read |
| Workspace setup (`setupWorkspace`) | worktree creation |
| Pipeline execution (`KeepAlive`, agent sessions) | unbounded |
| `resolveResumeStep` + `buildAllowedStepSet` | O(step_count) |
| `parseRequestMd(requestPath)` | O(file_size) |

The command is now strictly lighter than before, with no new monotonic-growth cost added.

---

## GitHub API Calls

| Call | Count | Proportional to |
|---|---|---|
| `getPullRequest(owner, repo, number)` | 1 per invocation | — |

Only one API call is made: fetch the single PR by number. No pagination, no comment listing, no review enumeration. This is the same call as in the original code.

---

## Findings

**No new scale-tolerance findings.**

The pre-existing `list({ includeArchived: true })` pattern in the error path is O(archive\_size), but:
- It is unchanged from the original implementation (pre-existing).
- It fires only on error paths, not on the happy-path critical section.
- It was already accepted as part of the original reopen command (#876).

---

## Evidence Summary

- **Checked**: 12 files / code paths verified
- **Skipped**: 0 within-scope paths
- **Unverified**: 0
