# Regression Gate Result — Iteration 1

**Branch**: change/slug-occupancy-enforcement-576cab22
**Date**: 2026-08-01

## Evidence

All 12 ledger findings were verified against `git diff main...HEAD`.

---

### T-09: onPipelineComplete fallback clause

**File**: `specrunner/changes/slug-occupancy-enforcement/spec.md`

**Evidence**: `spec.md` now contains the requirement "any other status → no Next guidance is printed (the else branch is a no-op)" under the "pipeline-complete Next guidance branches on the final state" section. The implementation in `src/cli/progress.ts` matches: the `onPipelineComplete` handler uses an `if/else if` with no unconditional fallback — only `awaiting-archive` and `awaiting-resume` emit output.

**Status**: Fixed ✓

---

### T-08: doctor repair SLUG_REGEX requirement

**File**: `specrunner/changes/slug-occupancy-enforcement/tasks.md`

**Evidence**: `tasks.md` T-08 now includes "The `slug` argument MUST be validated against `SLUG_REGEX` (consistent with `request-new.ts:24` and `command-registry.ts:417`)". The implementation at `src/core/occupancy/repair.ts:50-56` validates `SLUG_REGEX.test(slug)` before any I/O and throws `REQUEST_MD_INVALID` on failure. The command-registry doctor handler delegates directly to `repairSlugOccupancySidecar`, so validation is exercised on every CLI invocation.

**Status**: Fixed ✓

---

### B-001: claimLivenessSidecar connection

**File**: `src/core/runtime/local.ts` (was line 1423)

**Evidence**: `writeLivenessSidecar` no longer calls `fs.writeFile` unconditionally. It now delegates to `claimLivenessSidecar` with injected `readSidecar`, `getJobStatus`, and `writeSidecar` deps (diff lines +1423–+1468). `workspace-materializer.ts` continues to call `host.writeLivenessSidecar`, which now goes through check-and-claim. The second-line defense (D6) is live.

**Status**: Fixed ✓

---

### B-002: inbox rejection comment propagation

**File**: `src/core/inbox/run-inbox.ts` (was line 221)

**Evidence**: `defaultEffects.startJob` in `run-inbox.ts` now performs a D10 occupancy pre-check (diff +376–+391) before calling `runRunCore`. If a non-terminal job exists for the slug, it throws `SlugOccupiedError` synchronously. The surrounding catch block (diff +217–+257) matches `errAny.code === ERROR_CODES.SLUG_OCCUPIED` and posts an idempotent comment via `postRejectComment` using an HTML marker for deduplication. `runRunCore` error-swallowing no longer prevents comment posting.

**Status**: Fixed ✓

---

### B-003: doctor repair CLI registration

**File**: `src/cli/command-registry.ts` (was line 908)

**Evidence**: The `doctor` command handler now inspects `parsed.positionals[0] === "repair"` before the existing `runDoctor` call. When matched, it resolves `repairSlugOccupancySidecar` from `repair.ts` and executes it. `specrunner doctor repair <slug>` is no longer an unknown command.

**Status**: Fixed ✓

---

### W-001: resolveJobStateBySlug outside try/catch in CLI resume/reopen

**File**: `src/cli/resume.ts:47`, `src/cli/reopen.ts:58`

**Evidence**: Both files now wrap `resolveJobStateBySlug` in `try { ... } catch (err) { logError(...); return 1; }`. A thrown `slugOccupancyAmbiguousError` will be caught and logged rather than becoming an unhandled rejection.

**Status**: Fixed ✓

---

### W-002: --purge warning missing + terminal foreign sidecar blocks purge

**File**: `src/core/cancel/runner.ts` (was line 461)

**Evidence**: The purge block now:
1. Reads the sidecar to determine `foreignJobId`.
2. Looks up the foreign job's status via `JobStateStore.list`.
3. If the foreign job is terminal, allows the purge to proceed (no longer over-cautious).
4. If the foreign job is non-terminal, sets `skipPurge = true` **and** appends a warning to `warnings`: `"Warning: --purge skipped for slug '...': sidecar belongs to a different non-terminal job (...)."` This satisfies TC-031's requirement that a warning is emitted.

**Status**: Fixed ✓

---

### W-003: guard.ts isAlive never called

**File**: `src/core/occupancy/guard.ts`

**Evidence**: `assertSlugUnoccupied` now checks `prior.status === "running" && isAlive !== undefined && isAlive(prior.pid)` and emits the wait/cancel message for that branch; all other non-terminal occupants get the resume/cancel message. `deps.isAlive` is declared in `AssertSlugUnoccupiedDeps` and actually invoked in the implementation.

**Status**: Fixed ✓

---

### isAlive not wired in production

**File**: `src/core/runtime/local.ts` (was line 912)

**Evidence**: `assertNoDuplicateLiveJob` now calls `assertSlugUnoccupied(repoRoot, slug, { isAlive: (pid) => isProcessAlive(pid ?? 0) })`. The live-pid branch in `guard.ts` is reachable in production. `managed.ts` was also updated identically (verified via diff).

**Status**: Fixed ✓

---

### cancelAllTerminated leaves failed/terminated state files

**File**: `src/core/cancel/runner.ts` (was line 542)

**Evidence**: The `cancelAllTerminated` loop now, before removing the sidecar directory, checks `!TERMINAL_STATUSES.has(state.status)` and transitions the job to `canceled` via `transitionJob` + `store.persist` (diff +615–+640). After this write, the occupancy guard at the next start sees `canceled` (terminal) instead of `failed`/`terminated` (non-terminal). The sidecar directory removal follows as before.

**Status**: Fixed ✓

---

### ReopenCommand misleading 'Job not found' for terminal-only slugs

**File**: `src/core/command/reopen.ts` (was line 113)

**Evidence**: After `resolveJobStateBySlug` returns `null`, `ReopenCommand.prepare()` now performs a secondary lookup: `JobStateStore.list(cwd, { includeArchived: true })` filtered to the slug. If terminal jobs exist, it logs "Job '...' has status '...' and cannot be reopened. Only 'awaiting-archive' jobs are eligible for reopen." and throws `PrepareError(1)` — showing the correct status gate message rather than falling through to `JobStateStore.resolveId` with a misleading 'no job ID starts with' error.

**Status**: Fixed ✓

---

### scanSlugOccupancy swallows non-ENOENT errors from worktrees directory

**File**: `src/core/occupancy/scan.ts` (was line 88)

**Evidence**: The `fs.readdir(worktreesDir)` catch block now checks `code !== "ENOENT"`. Only `ENOENT` (directory absent) is silently ignored; any other error code (EACCES, EIO, etc.) sets `unreadable = "worktrees enumeration failure at ..."` which causes `assertSlugUnoccupied` to throw `SLUG_STATE_UNREADABLE` (fail-closed). The `tryReadStateJson` helper retains the same ENOENT-vs-other distinction established before this change.

**Status**: Fixed ✓

---

## Summary

All 12 ledger findings are confirmed fixed in the current branch. No regressions detected.
