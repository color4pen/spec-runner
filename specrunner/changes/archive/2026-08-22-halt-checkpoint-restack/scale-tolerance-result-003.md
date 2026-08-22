# scale-tolerance Review — halt-checkpoint-restack (Iteration 3)

## Scope

Code-fixer commit `73a36992` is the only change since round 2.

### Files touched by code-fixer (round 3)

| File | Change summary | Scale-tolerance scope? |
|------|----------------|------------------------|
| `tests/halt-checkpoint-restack-e2e.test.ts` | Assertion simplification (TC-027 graft check; AC-2 resumePoint assertion added) | No — test code only |
| `specrunner/changes/halt-checkpoint-restack/events.jsonl` | Job state artifact (pipeline journal record) | No — change-folder artifact |
| `specrunner/changes/halt-checkpoint-restack/state.json` | Job state artifact | No — change-folder artifact |
| `specrunner/changes/halt-checkpoint-restack/usage.json` | Job usage artifact | No — change-folder artifact |

**Production code files reviewed in iterations 1 and 2 are all unchanged** (verified via `git show 73a36992 --stat`):

- `src/core/step/checkpoint-restack.ts` — unchanged
- `src/core/step/commit-push.ts` — unchanged
- `src/store/event-journal.ts` — unchanged
- `src/store/job-journal.ts` — unchanged
- `src/store/job-state-store.ts` — unchanged
- `src/core/runtime/local.ts` — unchanged

## E2E test changes (scale-tolerance assessment)

The only production-code-adjacent file touched is `tests/halt-checkpoint-restack-e2e.test.ts`.
The diff is a pure assertion clarification:

1. **TC-027 graft check** — removed fragile `persistedOids.find(oid => …)` with conditional assertion;
   replaced with `expect(persistedOids).toContain(localTip)` (unconditional, cleaner).
2. **AC-2 resumePoint assertion** — added `expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer")`
   after the `runAttachVerification` call.

Neither change affects runtime behaviour or any monotonically-growing data structure.
Test code is out of scope for scale-tolerance analysis.

## Findings

No **needs-fix** findings.

## Observations (re-confirmed, all unchanged from iteration 2)

### O1 · `update-index` spawn loop is O(N) in change-folder entry count (re-confirmed)

**File**: `src/core/step/checkpoint-restack.ts` lines 280–309

One `git update-index` spawn per change-folder entry (removes + adds).
N = file count in a single job's change folder (~10–50), not archive count or cross-job quantity.
Triggered only after push double-failure — a one-time terminal event per halt, not a periodic tick.

**Not a scale problem** under the reviewer criteria.

### O2 · `unpublishedCommits: string[]` has no explicit size cap (re-confirmed)

**File**: `src/core/step/checkpoint-restack.ts` lines 176–191; `src/store/event-journal.ts` (`CheckpointRestackRecord`)

Full output of `git rev-list <parentOid>..<localTipOid>` is stored verbatim.
Bounded by pipeline step count since last successful push (~15 OIDs × 40 chars ≈ 600 bytes).
Appended once per halt event.

**Not a scale problem** under the reviewer criteria.

### O3 · `checkpointRestacks` always allocated in `fold()` (re-confirmed)

**File**: `src/store/event-journal.ts` line 347 (array initializer), line 457 (return)

After the F-03 fix (iteration 2), `checkpointRestacks: checkpointRestackRecords` is always present in the `fold()` return.
Empty-array allocation is O(1) — same pattern as `lineage`, `operatorEvents`, `findingRecency`.
Memory growth for a long-lived job with repeated halts is O(N_restack) per `fold()`, where N_restack is bounded by the
(rare) halt count for that job.

**Not a scale problem** under the reviewer criteria.

### O4 · Extra `stderrWrite` on restack `published` path (re-confirmed)

**File**: `src/core/step/commit-push.ts` lines 917–920

Single string output to stderr triggered only on restack-push-success — a one-time terminal event.
No file I/O, no journal write, no spawn.

**Not a scale problem.**

## Scale-axis Mapping

| Growth axis | Round 1–2 cost | Round 3 delta | Verdict |
|-------------|----------------|---------------|---------|
| Archive count | None | None | Not affected |
| Sidecar count | Temp index file created + deleted in `finally` (per restack event) | None | Not affected |
| Issue/PR count | None | None | Not affected |
| Comment count | None | None | Not affected |
| Per-job journal size | One `checkpoint-restack` record per restack event; O(1) `fold()` dispatch | None (test-only change) | Not a scale problem |
| Periodic paths (tick/exit/polling) | None — all code in terminal halt path only | None | Not affected |

## Conclusion

The round 3 code-fixer changes are limited to test assertion cleanup and pipeline state artifacts.
No production source file was modified.
All scale-tolerance properties established in iterations 1 and 2 remain valid.

No new scale-tolerance findings are raised. The implementation is **approved** under the scale-tolerance review criteria.
