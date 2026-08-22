# scale-tolerance Review — halt-checkpoint-restack (Iteration 1)

## Scope

Changed files in scope for this reviewer (`src/store/**`, `src/adapter/github/**`, `src/core/inbox/**`, `src/logger/**`):

| File | Relevance |
|------|-----------|
| `src/store/event-journal.ts` | New `CheckpointRestackRecord` type + `fold()` dispatch |
| `src/store/job-journal.ts` | New `appendCheckpointRestack` method |
| `src/store/job-state-store.ts` | New `appendCheckpointRestack` delegation |

Additional files reviewed for call-site context (outside declared paths):

| File | Relevance |
|------|-----------|
| `src/core/step/checkpoint-restack.ts` | New module — git spawn loop, `rev-list` accumulation |
| `src/core/step/commit-push.ts` | Integration point (`commitFinalState` failure path) |
| `src/core/runtime/local.ts` | Callback injection for store side-effects |

## Findings

No **needs-fix** findings.

## Observations (non-actionable, informational only)

### O1 · `update-index` spawn loop is O(N) in change-folder entry count

**File**: `src/core/step/checkpoint-restack.ts` lines 279–309

The tree-construction phase issues one `git update-index` spawn per entry in `parentEntries` (removes) and one per entry in `localEntries` (adds). For a typical change folder with 10–50 files this is 10–50 git subprocess invocations per restack event.

**Why this is not a scale problem under the reviewer criteria:**
- N = change folder file count for one job, **not** archive count, sidecar count, or cross-job quantity.
- The restack path is triggered only after `commitFinalState` push double-failure (halt + push rejection) — a one-time terminal event, not a periodic tick, exit-guard loop, or polling path.
- The design document (design.md, Risks/Trade-offs) explicitly acknowledges this as an accepted trade-off bounded to infrequent events.

### O2 · `unpublishedCommits: string[]` has no explicit size cap

**File**: `src/store/event-journal.ts` (`CheckpointRestackRecord.unpublishedCommits`), `src/core/step/checkpoint-restack.ts` lines 176–191

The full output of `git rev-list <parent>..<localTip>` is stored verbatim in the journal record. There is no OID-count cap. The `reason` field (push stderr) IS capped at 500 chars, but `unpublishedCommits` is not.

**Practical bound:** The commit count between `parentOid` and `localTipOid` is bounded by pipeline step count since the last successful push (~15 steps × 1 commit/step = at most ~15 OIDs, each 40 chars). Not a realistic scale concern, but differs from the truncation pattern applied to `reason`.

**Why this is not a scale problem under the reviewer criteria:**
- The array is bounded per-job by the number of pipeline steps, not by a monotonically growing cross-job metric.
- The record is appended once per halt event (not repeated per tick).
- The `fold()` accumulation of `checkpointRestacks` is O(1) per line on top of the existing O(n) pass — no new asymptotic cost.

### O3 · New `checkpointRestacks` field in `FoldResult` always collected in memory

**File**: `src/store/event-journal.ts` lines 346–348, 454–458

`fold()` now accumulates all `checkpoint-restack` records into `checkpointRestackRecords[]`. For a long-lived job that halts repeatedly, this array grows with the number of restack events. Given that each record is small (< 2 KB including OID list) and halt events are rare, memory impact is negligible. No action needed.

## Scale-axis Mapping

| Growth axis | New cost introduced | Verdict |
|-------------|---------------------|---------|
| Archive count | None — no scan, no cross-job operation | Not affected |
| Sidecar count | Temp index file (`.specrunner/local/<slug>/restack-index-*`) created + deleted in `finally` | Not a scale problem (cleanup guaranteed) |
| Issue/PR count | None — no GitHub API calls | Not affected |
| Comment count | None | Not affected |
| Per-job journal size | One `checkpoint-restack` record appended per restack event; `fold()` adds O(1) per new type dispatch | Not a scale problem |
| Periodic paths (tick/exit/polling) | None — all new code in terminal halt path only | Not affected |

## Conclusion

All new store-layer code (`event-journal.ts`, `job-journal.ts`, `job-state-store.ts`) follows the established append-only, journal-only pattern (same as `lineage`, `operator-event`, `finding-recency`). The new `checkpoint-restack.ts` module runs exclusively in the halt failure path, not in any periodic or background execution path.

No growth-proportional cost is added to any monotonically increasing axis (archives, sidecars, issues, comments, global journal). The implementation is **approved** under the scale-tolerance review criteria.
