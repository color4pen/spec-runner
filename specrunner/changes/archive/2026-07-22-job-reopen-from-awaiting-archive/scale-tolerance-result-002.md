# Scale-Tolerance Review: job-reopen-from-awaiting-archive

**Reviewer**: scale-tolerance  
**Iteration**: 002  

---

## Scope

Reviewed the HEAD diff against iteration 001 report findings, focusing on whether:
- Fixes applied since iteration 001 (FoldResult.operatorEvents required field, literal constructor updates, B-13/B-17 invariant additions) introduced any new proportional-cost path.
- The implementation introduced any new scan, load, or API-call path that grows proportionally with archive/sidecar/issue/PR/comment/journal count.

Files examined in addition to those covered in iteration 001:

| File | Reason |
|------|--------|
| `src/store/event-journal.ts` | `FoldResult.operatorEvents` now required — confirmed no change to scan cost |
| `src/store/job-journal.ts` | ENOENT literal updated with `operatorEvents: []` — confirmed O(0) impact |
| `src/store/job-state-projection.ts` | Empty-fallback literal updated with `operatorEvents: []` — confirmed O(0) impact |
| `tests/store/journal-integrity.test.ts` | `makeFoldResult` literal updated with `operatorEvents: []` — test helper only |
| `tests/unit/architecture/core-invariants.test.ts` | B-17 invariant (allowReopen call-site isolation), B-13 extended to include appendOperatorEvent — no runtime scaling |
| `tests/unit/architecture/arch-allowlist.ts` | Two allowlist entries added for reopen.ts — no runtime scaling |

---

## Checked Items

### 1. `FoldResult.operatorEvents` promoted from optional to required

`operatorEvents: OperatorEventRecord[]` is now a required field on `FoldResult`.
All three hand-built `FoldResult` literals that existed (ENOENT branch in `job-journal.ts`,
empty-fallback in `job-state-projection.ts`, and `makeFoldResult` helper in
`journal-integrity.test.ts`) were updated to include `operatorEvents: []`.

Scaling impact: none. The field was already being populated by `fold()` in iteration 001 — making it required changes only the static type contract. The runtime traversal path in `fold()` is unchanged (O(1) per operator-event record, within the pre-existing O(N) scan).

**Verdict**: no new proportional cost.

### 2. `persist()` fold path — interaction with operator-event append

When `appendOperatorEvent` is called (O(1) append of one line to events.jsonl) and `store.persist()` is subsequently called to save the `awaiting-archive → running` transition:

- `persist()` reads `state.json` to get stored counters (`_journal`).
- The fast-path check: `existingCounters.historyCount >= state.history.length`. Because the transition appended a new history entry, `state.history.length = old + 1`, so the fast path is **not** eligible.
- Falls to fold path: reads and folds the full per-job `events.jsonl` (O(events-in-job)).
- `operator-event` lines contribute to `foldResult.operatorEventRecords` but NOT to `historyCount` or `stepCounts`; they have no effect on the delta computation.
- One history delta entry (the `awaiting-archive → running` transition) is appended.

This is identical in shape to any other status transition persist — no new fold is introduced beyond what every transition already triggers. The per-job events.jsonl grows at O(reopen count) for operator-event lines, but per-job reopen count is bounded and low in practice.

**Verdict**: no new proportional cost vs pre-existing transition-persist behavior.

### 3. B-13 invariant extended to cover `appendOperatorEvent`

`core-invariants.test.ts` B-13 grep now includes `appendOperatorEvent` in its set of journal-seam appends that must NOT route through `state.json` mutation paths. This is an architectural guardrail test — it has no runtime scaling effect.

**Verdict**: no scaling impact.

### 4. B-17 invariant: `allowReopen` call-site isolation

`core-invariants.test.ts` B-17 asserts that `{ allowReopen: true }` appears only in `src/core/command/reopen.ts`. This confirms the reopen transition edge cannot be triggered by any periodic or automated path (no pipeline coordinator, no exit-guard, no inbox tick can call it). Verified by walking `src/core/command/reopen.ts` — the only consumer.

**Verdict**: no periodic path exposure; reopen remains manual-command only.

### 5. Re-verification of catalog scan pattern (iteration 001 carryover)

The two `resolveJobStateBySlug(slug, cwd)` calls (once in `src/cli/reopen.ts:58`, once in `src/core/command/reopen.ts:113`) each invoke `JobStateStore.list(repoRoot, { includeArchived: true })`. This O(active + archive) scan per invocation was identified in iteration 001. No changes were made to this pattern in iteration 002.

Per reviewer criteria: manual operator command with archive-wide scan is acceptable. The pattern is identical to `src/cli/resume.ts:45` and `src/core/command/resume.ts:99`.

**Verdict**: no change from iteration 001 assessment. Acceptable per criteria.

### 6. No new periodic paths introduced

Checked `src/core/lifecycle/exit-guard.ts` (import set unchanged), pipeline coordinator (`src/core/pipeline/`), and inbox tick paths. No references to `ReopenCommand`, `appendOperatorEvent`, or `REOPEN_TRANSITIONS` were found outside the manual-command path.

**Verdict**: no periodic path regression.

### 7. No new unbounded file or artifact growth

The `operatorEvents: []` literal additions and the `FoldResult` type change do not introduce any new file creation. The architecture invariant tests (B-13, B-17, arch-allowlist) are compile-time / test-time only. No new per-job directories or retention-free files are created by the reopen command itself.

**Verdict**: no new unbounded artifact growth.

---

## Summary

| Item | Axis | Path | Assessment |
|------|------|------|-----------|
| `FoldResult.operatorEvents` required field | — | type-only change | OK — no runtime cost change |
| Three `operatorEvents: []` literal additions | — | ENOENT / empty-fallback / test helper | OK — compile-time only |
| `persist()` fold after operator-event append | per-job journal size | manual command | OK — identical to any other transition-persist |
| B-13 invariant extension | — | test-time only | OK — guardrail, no runtime scaling |
| B-17 call-site isolation invariant | — | test-time only | OK — confirms no periodic-path exposure |
| Catalog scan × 2 per invocation (carryover) | active + archived jobs | manual command | OK per criteria — pre-existing pattern, no change |
| No new periodic paths | — | — | OK |
| No new unbounded artifact growth | — | — | OK |

No needs-fix findings. Changes since iteration 001 are purely structural correctness improvements (required field promotion, literal constructor updates, architecture invariant tests) with no effect on scaling behavior.
