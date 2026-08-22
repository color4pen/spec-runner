# scale-tolerance Review — halt-checkpoint-restack (Iteration 2)

## Scope

Files changed by code-fixer since round 1 (subject of this round):

| File | Change summary |
|------|----------------|
| `src/core/step/checkpoint-restack.ts` | F-01 fix: `recordRestack` now guarded inside `!localTipFailed` block; no-local-tip early return fires before journal append |
| `src/store/event-journal.ts` | F-03 fix: `checkpointRestacks` always emitted as `CheckpointRestackRecord[]` in `fold()` return (no longer conditional on record presence) |
| `src/core/step/commit-push.ts` | F-02(1) fix: additional `stderrWrite` warn on `published` path ("以降の push も同じ理由で拒否される可能性がある") |
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | Test file — not subject to scale-tolerance analysis |
| `src/core/step/__tests__/checkpoint-restack.test.ts` | Test file — not subject to scale-tolerance analysis |

Previously reviewed files (unchanged since round 1):

| File | Relevance |
|------|-----------|
| `src/store/job-journal.ts` | `appendCheckpointRestack` delegation — unchanged |
| `src/store/job-state-store.ts` | Store delegation to journal — unchanged |
| `src/core/runtime/local.ts` | `commitFinalState` callback injection (`recordRestack`, `persistBeforePush`) — unchanged |

## Findings

No **needs-fix** findings.

## Observations (non-actionable, re-confirmed for completeness)

### O1 · `update-index` spawn loop is O(N) in change-folder entry count (re-confirmed, unchanged)

**File**: `src/core/step/checkpoint-restack.ts` lines 280–309

Code unchanged since round 1. One `git update-index` spawn per change-folder entry (removes + adds). N = file count in one job's change folder (~10–50), not archive count or cross-job quantity. Triggered only after push double-failure — a one-time terminal event, not a periodic tick.

**Still not a scale problem** under the reviewer criteria.

### O2 · `unpublishedCommits: string[]` has no explicit size cap (re-confirmed, unchanged)

**File**: `src/core/step/checkpoint-restack.ts` lines 176–191; `src/store/event-journal.ts` (`CheckpointRestackRecord`)

Code unchanged since round 1. The full output of `git rev-list <parentOid>..<localTipOid>` is stored verbatim. Bounded by pipeline step count since last successful push (~15 OIDs × 40 chars = ~600 bytes). Appended once per halt event.

**Still not a scale problem** under the reviewer criteria.

### O3 · `checkpointRestacks` collected in memory on every `fold()` call (updated — F-03 fix)

**File**: `src/store/event-journal.ts` line 347 (array initializer), line 457 (return)

After the F-03 fix, `checkpointRestacks` is now **always** included in the `fold()` return value as an initialized array (no longer conditional on record presence). Effect: every `fold()` call allocates an empty `CheckpointRestackRecord[]` if no restack records exist. This is an O(1) overhead — the same asymptotic cost as the other always-populated arrays (`lineage`, `operatorEvents`, `findingRecency`). No new asymptotic cost is introduced.

Memory growth for a long-lived job with repeated halts remains O(N_restack) per `fold()` call, where N_restack is bounded by the (rare) halt count for that job.

**Still not a scale problem** under the reviewer criteria.

### O4 · New `stderrWrite` on `published` path (new, F-02(1) fix)

**File**: `src/core/step/commit-push.ts` lines 917–920

A second `stderrWrite` call is appended in the `published` case of the restack outcome switch. This is a single string output to stderr, triggered only when a restack push succeeds — a one-time terminal event. No file I/O, no journal write, no spawn.

**Not a scale problem.**

## Scale-axis Mapping

| Growth axis | Round 1 cost | Round 2 delta | Verdict |
|-------------|-------------|---------------|---------|
| Archive count | None | None | Not affected |
| Sidecar count | Temp index file created + deleted in `finally` (per restack event) | None | Not affected |
| Issue/PR count | None | None | Not affected |
| Comment count | None | None | Not affected |
| Per-job journal size | One `checkpoint-restack` record per restack event; O(1) `fold()` dispatch | `checkpointRestacks` array now always in `FoldResult` (O(1) empty array) | Not a scale problem |
| Periodic paths (tick/exit/polling) | None — all code in terminal halt path only | None | Not affected |

## Conclusion

The code-fixer changes (F-01, F-02(1), F-03, F-04) introduce no new growth-proportional cost to any monotonically increasing axis (archives, sidecars, issues, comments, global journal). The F-03 change (`checkpointRestacks` always emitted) adds an O(1) empty-array allocation per `fold()` call, matching the pattern already established by `lineage`, `operatorEvents`, and `findingRecency`.

All new store-layer code continues to follow the established append-only, journal-only pattern. The restack code path remains exclusively in the halt double-failure terminal path — not in any periodic, background, or polling execution path.

No new scale-tolerance findings are raised. The implementation is **approved** under the scale-tolerance review criteria.
