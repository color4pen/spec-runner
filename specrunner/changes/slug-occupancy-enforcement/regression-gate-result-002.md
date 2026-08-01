# Regression Gate Result — Iteration 2

**Change**: slug-occupancy-enforcement
**Iteration**: 2
**Date**: 2026-08-01

## Evidence Summary

All 12 findings from the ledger were verified against the current code. No regressions detected.

---

### T-09 [LOW] — onPipelineComplete フォールバックケース

**File**: `src/cli/progress.ts:163-172`

`onPipelineComplete` now branches on `p.state.status`: `awaiting-archive` → archive hint, `awaiting-resume` → resume hint, all other statuses → no output (else is a no-op). Spec.md line 217 also now documents "any other status → no Next guidance is printed (the else branch is a no-op)."

**Status**: Fixed ✓

---

### T-08 [LOW] — doctor repair CLI の slug バリデーション

**File**: `specrunner/changes/slug-occupancy-enforcement/tasks.md:146-147`, `src/core/occupancy/repair.ts:50-56`

tasks.md now explicitly requires SLUG_REGEX validation. `repairSlugOccupancySidecar` validates the slug against `SLUG_REGEX` (imported from `src/util/validation-patterns.ts`) before any I/O and throws a descriptive error on mismatch.

**Status**: Fixed ✓

---

### B-001 [CRITICAL] — claimLivenessSidecar 未接続

**File**: `src/core/runtime/local.ts:1432-1450`

`writeLivenessSidecar` now calls `claimLivenessSidecar` (not unconditional `fs.writeFile`). The claim logic reads the existing sidecar, checks the foreign job's status, and refuses to overwrite a non-terminal foreign job's sidecar. I/O write failures remain best-effort swallowed, but claim-refusal errors propagate.

**Status**: Fixed ✓

---

### B-002 [CRITICAL] — inbox 拒否コメントが本番経路で投稿されない

**File**: `src/core/inbox/run-inbox.ts:379-401`

The default `startJob` effect now performs an occupancy pre-check (D10) before calling `runRunCore`. It filters all job states for non-terminal occupants of the slug and throws `slugOccupiedError` if found. The inbox catch block at lines 219-255 catches `SLUG_OCCUPIED`, posts an idempotent reject comment via `postRejectComment`, and deduplicates via a machine-readable marker encoding the prior `jobId`.

**Status**: Fixed ✓

---

### B-003 [HIGH] — specrunner doctor repair <slug> CLI 未登録

**File**: `src/cli/command-registry.ts:916-934`

The doctor command handler now detects `positionals[0] === "repair"`, extracts the slug argument, imports `repairSlugOccupancySidecar`, and runs the repair. The slug presence is validated; SLUG_REGEX validation is delegated to `repairSlugOccupancySidecar`. Exit codes are properly mapped (0 on success, `GENERAL_ERROR` on exception).

**Status**: Fixed ✓

---

### W-001 [MEDIUM] — resume.ts / reopen.ts で resolveJobStateBySlug が try/catch 外

**File**: `src/cli/resume.ts:48-52`, `src/cli/reopen.ts:58-63`

Both CLI wrappers now wrap `resolveJobStateBySlug` in `try/catch`, log the error message, and return exit code 1. `slugOccupancyAmbiguousError` will not produce an unhandled rejection.

**Status**: Fixed ✓

---

### W-002 [MEDIUM] — --purge skip 時に warning なし + terminal foreign sidecar でも purge をブロック

**File**: `src/core/cancel/runner.ts:506-525`

The `--purge` path now looks up the foreign job's status. If the foreign job is terminal, the directory is purged (stale sidecar is not over-cautious). If the foreign job is non-terminal, `skipPurge = true` and a warning is pushed to `warnings[]`: `"Warning: --purge skipped for slug '...': sidecar belongs to a different non-terminal job (...). Cancel that job first."` — satisfying TC-031's "a warning is emitted" requirement.

**Status**: Fixed ✓

---

### W-003 [MEDIUM] — running + alive guard メッセージが resume になっている

**File**: `src/core/occupancy/guard.ts:57-67`

`assertSlugUnoccupied` now calls `isAlive(prior.pid)` when `isAlive` is provided and `prior.status === "running"`. Running+alive → throws with wait/cancel message. All other non-terminal statuses → throws with resume/cancel message (via `slugOccupiedError`).

**Status**: Fixed ✓

---

### isAlive not wired in production [MEDIUM] — live-pid message routing inactive

**File**: `src/core/runtime/local.ts:914-916`

`assertNoDuplicateLiveJob` now passes `{ isAlive: (pid) => isProcessAlive(pid ?? 0) }` to `assertSlugUnoccupied`. The live-pid branch in guard.ts is reachable in production for local runtime jobs. `managed.ts:602` was verified with the same pattern.

**Status**: Fixed ✓

---

### cancelAllTerminated [HIGH] — failed/terminated state files が残存して新規 start をブロック

**File**: `src/core/cancel/runner.ts:619-641`

`cancelAllTerminated` now transitions non-terminal states (failed/terminated) to `canceled` before removing the sidecar directory. A `JobStateStore` is constructed at the main checkout location and `canceledState` is persisted so `scanSlugOccupancy` sees the terminal status on subsequent guard checks. Already-canceled jobs skip the transition (no-op). Persist failures are best-effort.

**Status**: Fixed ✓

---

### ReopenCommand.prepare() [MEDIUM] — terminal-only slug で 'Job not found' が表示される

**File**: `src/core/command/reopen.ts:113-132`

When `resolveJobStateBySlug` returns `null`, `prepare()` now looks up all states (including archived) for the slug and, if terminal jobs are found, shows the status gate message ("only awaiting-archive jobs are eligible for reopen") rather than falling through to `resolveId`. This mirrors the fix already present in `ResumeCommand.prepare()`.

**Status**: Fixed ✓

---

### scanSlugOccupancy [MEDIUM] — non-ENOENT I/O failure を 'no worktrees' として swallow

**File**: `src/core/occupancy/scan.ts:108-116`

The `readdir(worktreesDir)` catch block now inspects `(err as NodeJS.ErrnoException).code`. Only `ENOENT` is suppressed (directory absent = no worktrees). All other error codes (EACCES, EIO, etc.) set `unreadable` to a descriptive message, causing `assertSlugUnoccupied` to refuse the start (fail-closed, consistent with design.md D4).

**Status**: Fixed ✓

---

## Conclusion

**12/12 findings verified as fixed. No regressions. No contradictions.**
