# scale-tolerance Review — halt-checkpoint-restack (Iteration 4)

## Scope

Iteration 4 corresponds to code-fixer commit `41b0cd04`. The only file changes since
iteration 3 are:

| File | Change summary | Scale-tolerance scope? |
|------|----------------|------------------------|
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | Added TC-006 — `detectCounterReversal()` returns null when `foldResult` includes `checkpoint-restack` records (3 sub-cases: baseline, multi-restack, zero-baseline) | No — test code only |
| `specrunner/changes/halt-checkpoint-restack/events.jsonl` | Pipeline journal record | No — change-folder artifact |
| `specrunner/changes/halt-checkpoint-restack/state.json` | Pipeline state artifact | No — change-folder artifact |
| `specrunner/changes/halt-checkpoint-restack/usage.json` | Pipeline usage artifact | No — change-folder artifact |

**All production source files are unchanged since iteration 2** (confirmed via `git show HEAD --stat`):

- `src/core/step/checkpoint-restack.ts` — unchanged
- `src/core/step/commit-push.ts` — unchanged
- `src/store/event-journal.ts` — unchanged
- `src/store/job-journal.ts` — unchanged
- `src/store/job-state-store.ts` — unchanged
- `src/core/runtime/local.ts` — unchanged

## New Test Code (TC-006) — Scale-tolerance Assessment

The single code-fixer change adds TC-006 into `event-journal-checkpoint-restack.test.ts`:

```
describe("TC-006: detectCounterReversal() returns null when foldResult includes …")
  it("TC-006-a: stored counters equal fold counts — checkpoint-restack record does not cause reversal")
  it("TC-006-b: multiple checkpoint-restack records still yield null from detectCounterReversal")
  it("TC-006-c: checkpoint-restack-only journal yields null for zero-baseline stored counters")
```

These tests invoke `fold()` (pure string parsing, no I/O) and `detectCounterReversal()` (pure
counter comparison, no I/O) on short inline strings. No directories are scanned, no files are
opened, no API calls are made, no periodic paths are exercised. Test code has no runtime impact.

`detectCounterReversal()` itself (in `src/store/journal-integrity.ts`) was already present and
operates in O(S) where S = number of distinct steps in `stored.stepCounts`. S is bounded by
the number of pipeline steps (≤13 built-in + custom reviewers, O(1) in practice). The function
was not modified in this iteration.

`scanJournalIntegrity()` in `journal-integrity.ts` scans active changes + worktrees + archive.
This was unchanged from prior iterations and continues to carry the O(archive count) cost of the
doctor subcommand (manual invocation only). No new call sites were added.

## Observations (re-confirmed from Iteration 3)

All four observations from iterations 1–3 remain valid and unchanged:

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

`checkpointRestacks: checkpointRestackRecords` is always present in the `fold()` return.
Empty-array allocation is O(1) — same pattern as `lineage`, `operatorEvents`, `findingRecency`.
Memory growth for a long-lived job with repeated halts is O(N_restack) per `fold()`, where
N_restack is bounded by the (rare) halt count for that job.

**Not a scale problem** under the reviewer criteria.

### O4 · Extra `stderrWrite` on restack `published` path (re-confirmed)

**File**: `src/core/step/commit-push.ts` lines 917–920

Single string output to stderr triggered only on restack-push-success — a one-time terminal event.
No file I/O, no journal write, no spawn.

**Not a scale problem.**

## Scale-axis Mapping

| Growth axis | Round 1–3 cost | Round 4 delta | Verdict |
|-------------|----------------|---------------|---------|
| Archive count | `scanJournalIntegrity()` O(archive) in doctor (manual only) | None | Not affected |
| Sidecar count | Temp index file created + deleted in `finally` (per restack event) | None | Not affected |
| Issue/PR count | None | None | Not affected |
| Comment count | None | None | Not affected |
| Per-job journal size | One `checkpoint-restack` record per restack event; O(1) `fold()` dispatch | None (test-only change) | Not a scale problem |
| Periodic paths (tick/exit/polling) | None — all code in terminal halt path only | None | Not affected |
| `detectCounterReversal()` call sites | O(S) counter comparison; S ≤ step count | TC-006 confirms no impact | Not a scale problem |

## Findings

No **needs-fix** findings.

## Conclusion

The round 4 code-fixer changes are limited to test assertions (`TC-006`) and pipeline state
artifacts. No production source file was modified. All scale-tolerance properties established
in iterations 1 and 2 remain valid.

TC-006 positively confirms that `checkpoint-restack` records do not affect `historyCount` or
`stepCounts` in `fold()`, and therefore do not trigger false counter reversals via
`detectCounterReversal()`. This is a scale-safety property: even if many restack events
accumulate in `events.jsonl` over a job's lifetime, the counter reversal check remains correct.

No new scale-tolerance findings are raised. The implementation is **approved** under the
scale-tolerance review criteria.
