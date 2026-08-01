# cross-boundary-invariants Review — slug-occupancy-enforcement — iter 1

## Scope

Reviewed `git diff main...HEAD` (50 files, 6720 insertions / 115 deletions). Focus: invariants
held by **unchanged** code whose implicit assumptions the new behaviour silently breaks.

---

## Finding 001 — `cancelAllTerminated` leaves `failed`/`terminated` state files intact; new state-based guard keeps blocking starts after bulk cleanup

**Severity**: high

### What the new code does

`TERMINAL_STATUSES = { archived, canceled }` (unchanged, `src/state/lifecycle.ts:58`). The new
guard at `src/core/occupancy/guard.ts:54` blocks starts whenever
`result.nonTerminal.length >= 1`, where non-terminal = `status ∉ TERMINAL_STATUSES`. This makes
`failed` and `terminated` non-terminal occupants that block new starts.

### The unchanged code whose assumption is broken

`cancelAllTerminated` (`src/core/cancel/runner.ts:542-602`) is the bulk-cleanup path invoked by
`job cancel --all-terminated`. It targets `BULK_CLEANUP_STATUSES = { failed, terminated,
canceled }` and, for each, executes only:

```typescript
await fs.rm(path.join(repoRoot, localSidecarDir(slug)), { recursive: true, force: true });
```

It removes `.specrunner/local/<slug>/` (the machine-local sidecar directory) but **does not
transition the job state to `canceled`** and **does not delete or update state files** at
`specrunner/changes/<slug>/state.json`.

### Why this breaks under the new guard

Old (pid-based) guard: dead pid → allowed. After `cancelAllTerminated` removed the sidecar,
the process was already dead → new start passed.

New (state-based) guard: status ∉ TERMINAL_STATUSES → blocked. After `cancelAllTerminated`:
the state file still shows `failed` or `terminated`. `scanSlugOccupancy` reads that file
(location 1: `specrunner/changes/<slug>/state.json`) and returns it as a non-terminal
occupant → new start is rejected.

### Concrete failure path

1. Job runs, fails → state shows `failed` at `specrunner/changes/my-slug/state.json`.
2. User runs `job cancel --all-terminated`.
3. Output: "Removed 1 job(s)." (sidecar dir gone; state file untouched).
4. User runs `job start my-slug` (or `run`).
5. Guard calls `scanSlugOccupancy` → finds `failed` state → throws
   `SLUG_OCCUPIED` ("Slug 'my-slug' is occupied by a non-terminal job (xxx, status: failed)").
6. User is stuck: the bulk-cleanup tool they used reports success but the slot remains blocked.
   Unblocking requires `job cancel <jobId>` (single-job cancel that transitions state to
   `canceled`).

### Evidence lines

- `src/core/cancel/runner.ts:68-69` — `BULK_CLEANUP_STATUSES = { failed, terminated, canceled }`.
- `src/core/cancel/runner.ts:585-591` — only `fs.rm(localSidecarDir(slug))`, no state mutation.
- `src/core/occupancy/guard.ts:54-67` — blocks on `nonTerminal.length >= 1`.
- `src/state/lifecycle.ts:58` — `TERMINAL_STATUSES = { archived, canceled }`.
- `src/core/occupancy/scan.ts:79-85` — reads `specrunner/changes/<slug>/state.json` (location 1).

### Design acknowledgement

`design.md` Open Questions flags `cancelAllTerminated` for a different risk (sidecar collateral
when a live job shares the slug). The inverse problem — that `failed`/`terminated` job states
persist as non-terminal occupants after bulk "cleanup" — is not addressed. The function's
doc-comment (`src/core/cancel/runner.ts:538`) says "Bulk delete state files" but the code never
deletes state files; this pre-existing inaccuracy amplifies the confusion for users.

---

## Finding 002 — `ReopenCommand.prepare()` degraded to "Job not found" for terminal-only slugs after resolver change

**Severity**: medium

### What the new code does

`resolveJobStateBySlug` was rewritten to return only non-terminal jobs (status ∉
TERMINAL_STATUSES). For a slug whose only jobs are `canceled` or `archived` (both terminal),
it returns `null`.

### The unchanged code whose assumption is broken

`ReopenCommand.prepare()` (`src/core/command/reopen.ts:113-135`) calls
`resolveJobStateBySlug`. When the resolver returned a terminal job (old behavior), the status
gate at line 139 produced the clear message:

> "Job 'my-slug' has status 'canceled' and cannot be reopened. Only 'awaiting-archive' jobs
> are eligible for reopen."

When the resolver now returns `null` (new behavior for terminal-only slugs), the code falls
through to the `JobStateStore.resolveId` fallback, which tries to match the slug string
against job ID prefixes (UUIDs). Since a slug like `"fix-auth-bug"` matches no UUID, it throws
`JOB_NOT_FOUND`: "no job ID starts with 'fix-auth-bug'." The status gate at line 139 is never
reached.

### Asymmetry with ResumeCommand

`ResumeCommand.prepare()` (`src/core/command/resume.ts:107-121`) was explicitly updated with a
terminal-job fallback: when `resolveJobStateBySlug` returns `null`, it queries
`JobStateStore.list` for terminal jobs on that slug and shows the appropriate "cannot transition
from 'canceled'" message. `ReopenCommand.prepare()` received no equivalent update.

### Concrete failure path

Before this change:
```
$ specrunner job reopen my-canceled-slug
Error: Job 'my-canceled-slug' has status 'canceled' and cannot be reopened.
       Only 'awaiting-archive' jobs are eligible for reopen.
```

After this change:
```
$ specrunner job reopen my-canceled-slug
Error: Job not found: no job ID starts with 'my-canceled-slug'
Hint: Run specrunner job ls to list available job IDs.
```

The error is factually wrong (the job exists), misleads the user to job-ID resolution, and
hides the diagnostic "only awaiting-archive is reopenable."

Note: `job reopen <slug>` for `awaiting-archive` jobs is unaffected (awaiting-archive is
non-terminal → resolver returns it → works correctly).

### Evidence lines

- `src/core/resume/resolve-job.ts:30-37` — returns null for terminal-only slugs.
- `src/core/command/reopen.ts:113-135` — null falls to `resolveId` fallback; no terminal-job check.
- `src/core/command/resume.ts:107-121` — updated terminal-job fallback (reference for the missing pattern).
- `src/store/job-catalog.ts:284-289` — `resolveId` throws `JOB_NOT_FOUND` when prefix matches nothing.

### Design mention

`design.md` D5 states "`src/core/command/reopen.ts:113` already wraps the call; their generic
catch will surface the message, which is acceptable." The generic catch surfaces the THROW case
(ambiguous breach). The null-return case for terminal slugs was not addressed.

---

## Non-findings

- **`scanSlugOccupancy` location 3 (`.specrunner/local/<slug>/state.json`)**: confirmed to
  exist for managed runtime jobs (`ManagedRuntime.managedLocalStore` at `managed.ts:113-116`
  writes `JobStateStore` with `changeDir = localSidecarDir(slug)`). Not a false scan path.
- **`claimLivenessSidecar` / `writeLivenessSidecar` SLUG_OCCUPIED propagation**: correctly
  threads the claim-refusal through `local.ts:1462-1464`. I/O errors remain best-effort
  (design D6 intent preserved).
- **`resolveJobStateBySlug` + `ReopenCommand` for `awaiting-archive` jobs**: `awaiting-archive`
  is non-terminal → resolver returns it → `reopen` command works correctly.
- **inbox occupancy pre-check vs. guard data-source inconsistency** (`JobStateStore.list`
  silently skips corrupted states while `scanSlugOccupancy` fails-closed): the pre-check is
  for the deduped-comment path only; the authoritative guard (pipeline-run.ts) always fires
  regardless. The gap is isolated to the inbox comment path in the corrupted-state edge case,
  which is minor and within the design's stated intent for D10.
- **`cancelAllTerminated` collateral sidecar deletion** (flagged in design.md Open Questions):
  the scenario where a non-terminal job's sidecar is deleted requires an already-broken
  invariant (two non-terminal jobs per slug), so it's defence-in-depth, not a new regression.
