# Cross-Boundary Invariants Review — agent-invocation-metrics

**Reviewer**: cross-boundary-invariants  
**Iteration**: 3  
**Change**: specrunner/changes/agent-invocation-metrics

---

## Scope Walked

| Layer | Files Examined |
|-------|---------------|
| Core types | `src/core/usage/types.ts`, `src/core/port/agent-runner.ts` (full) |
| Adapter | `src/adapter/claude-code/agent-runner.ts` (lines 383–1108), `src/adapter/claude-code/query-one-shot.ts` (full) |
| Shared | `src/adapter/shared/follow-up.ts` — `mergeFollowUpResult` |
| Wiring | `src/core/step/executor.ts:505-522`, `src/core/step/commit-orchestrator.ts:56-93, 215-252` |
| Commands | `src/core/command/job-stats.ts` (full), `src/core/command/usage-show.ts` (full) |
| Persistence | `src/core/usage/store.ts` |
| Tests (existing) | `tests/unit/core/command/job-stats.test.ts` (TC-JSTATS-019 thru 024b) |
| Tests (new) | `agent-runner-invocation-metrics.test.ts`, `query-one-shot-metrics.test.ts`, `job-stats-metrics.test.ts`, `commit-orchestrator-usage-metrics.test.ts`, `usage-show-metrics.test.ts`, `invocation-types.test.ts`, `store-backward-compat.test.ts` |
| Artefacts | `design.md`, `tasks.md`, `review-feedback-002.md`, `cross-boundary-invariants-result-001.md`, `cross-boundary-invariants-result-002.md` |
| Managed adapter | `src/adapter/managed-agent/agent-runner.ts` — confirmed no `invocationMetrics` set |

---

## Resolution of Prior-Iteration Findings

### iter-1 F-001 [HIGH] Follow-up cost drop → **RESOLVED**

`costUsd` continues to use `computeCostUsd(modelUsage)` for ALL invocations (modelUsage IS accumulated across follow-up turns). `measuredCostUsd` is an independent parallel field. The invariant "every token in extractedModelUsage contributes to costUsd" is preserved. ✓

### iter-1 F-004 [LOW] postWorkPrompts error return missing `invocationMetrics` → **RESOLVED**

`agent-runner.ts:923` includes `invocationMetrics: extractedMetrics` in the postWorkPrompts error return. ✓

### iter-1 F-005 / iter-2 feedback F-003 [LOW] Redundant `as unknown as` casts → **RESOLVED**

Both `job-stats.ts` and `usage-show.ts` now access `inv.numTurns`, `inv.totalCostUsd`, etc. as direct typed fields without intermediate casts. ✓

### iter-2 F-001 [MEDIUM] AC #7 / design D6 misalignment → **RESOLVED by design evolution**

The accepted design (current `design.md` D6, `request.md` AC #7, `tasks.md` T-06) has been updated to the parallel-column approach: `costUsd` = pricing-table estimate unchanged; `measuredCostUsd` = SDK-measured total, independent. `costBasis` was explicitly dropped ("costBasis は導入しない"). The implementation matches the accepted design. ✓

---

## Findings

### F-001 [LOW] TC-JSTATS-024 label "row keys match spec" remains misleading

**File**: `tests/unit/core/command/job-stats.test.ts:489`

TC-JSTATS-024 was carried over from iter-2 without renaming. The test label claims "row keys match spec" but it constructs a hand-crafted `JobStatRow` without `measuredCostUsd` or `turns`, so the JSON row has only 6 fields and the assertion passes on a 6-field schema. The real `deriveRunStat` always emits an 8-field row.

TC-JSTATS-024b (added in iter-2) correctly covers the 8-field real schema, so the gap is functionally closed. However, TC-JSTATS-024's label is still the most prominent description of "row schema," making it the first thing a maintainer reads — at which point it gives an incorrect, incomplete picture.

**Fix**: Rename TC-JSTATS-024 to "hand-crafted row without optional fields serializes to 6 keys" (or equivalent), distinguishing it from TC-JSTATS-024b.

---

### F-002 [LOW] TC-JSTATS-020 description does not mention new table columns "SDK $" and "Turns"

**File**: `tests/unit/core/command/job-stats.test.ts:425`

TC-JSTATS-020 is titled "shows column headers Slug, Date, Duration, Convergence, Cost, Outcome". The current `renderJobStatsTable` header list is:

```typescript
["Slug", "Date", "Duration", "Convergence", "Cost", "SDK $", "Turns", "Outcome"]
```

The test only checks `.toContain()` for the 6 original headers and does not assert that "SDK $" or "Turns" are present. A future removal of either new header would not be caught by TC-JSTATS-020.

This is the same pattern as TC-JSTATS-024: existing tests preserve AC #10 compatibility but leave coverage of new columns to the newer test suite. The verification-result shows all 692 test files green, confirming no regression. However, TC-JSTATS-020 no longer serves as a complete header-coverage gate.

**Fix** (either):
1. Add `.toContain("SDK $")` and `.toContain("Turns")` to TC-JSTATS-020 and update its description.
2. Add a new complementary test "shows all 8 column headers including SDK $ and Turns" alongside TC-JSTATS-020 without modifying it.

---

## Observations

**O-1**: `extractInvocationMetrics` always returns an explicit object (never `undefined`), even when all 4 SDK fields are absent. The returned object has 4 keys all set to `undefined`. This propagates through `...(invocationMetrics ?? {})` in commit-orchestrator, adding 4 `undefined`-valued properties to the in-memory `CommandInvocation`. JSON.stringify omits `undefined` values, so usage.json correctly contains only fields that carried real numbers. Round-trip read-back via `readUsageFile` produces objects where the absent fields return `undefined` on property access. All consumers use `typeof inv.field === "number"` guards that correctly handle both cases. Functionally correct — the subtle in-memory vs. serialized difference is worth documenting but is not a defect.

**O-2**: `deriveFromJobState` (`src/core/usage/store.ts:58`) constructs `CommandInvocation` entries from `JobState.StepRun` without the new metrics fields. `StepRun` does not carry `numTurns`, `durationMs`, `durationApiMs`, or `totalCostUsd`. Currently has no production callers (only tests). If this function is activated as a migration or repair path, the reconstructed entries will silently lack metrics even for runs that did capture them. No change since iter-1 O-1. A doc comment on `deriveFromJobState` warning of this limitation would help future maintainers.

**O-3**: `renderJobStatsTable` uses `!= null` (catches `null` and `undefined`) for `measuredCostUsd` and `turns`, but `!= null` for `costUsd` as well (line 337). Since `costUsd` is `number | null` from `deriveRunStat` (never `undefined`), both forms are correct. The inconsistency is harmless but slightly uneven. Noted in iter-2 O-3, unchanged.

**O-4**: The `result-file-not-found` error return (`agent-runner.ts:1034-1046`) does not include `invocationMetrics` even though `extractedMetrics` has been set at that point (success block at line 861 ran before the result file read failed). Design D2 explicitly excludes this path from carrying metrics. Functional impact is zero: this error path returns `completionReason: "error"`, so the executor converts it to a halt via `makeNonSuccessHalt` and `applySuccessPostPersistEffects` (which writes to usage.json) is never called for halts. The doc comment on `AgentRunResult.invocationMetrics` says "for both success and error subtypes" which is technically imprecise for this specific subcase — the postWorkPrompts error path (line 923) correctly includes metrics but the result-file-not-found path does not. Low documentation risk.

**O-5**: Summary aggregation (`buildJobStatsReport`) does not include `measuredCostUsd` or `turns` aggregates. Intentional per D8. The table shows per-run "SDK $" and "Turns" columns but the summary footer covers only pricing-table cost. Users requiring total measured cost or total turns must sum the rows manually (or use `--json`).

---

## Evidence Summary

| Item | Status |
|------|--------|
| iter-1 F-001: follow-up cost drop | ✓ RESOLVED — parallel columns, costUsd uses modelUsage (all-turn) |
| iter-1 F-004: postWorkPrompts error invocationMetrics | ✓ RESOLVED — line 923 sets extractedMetrics |
| iter-1 F-005: redundant casts | ✓ RESOLVED — direct typed field access |
| iter-2 F-001: AC #7 / D6 alignment | ✓ RESOLVED — design evolved to parallel columns, implementation matches |
| iter-2 F-002: TC-JSTATS-024 title misleading | ✗ Still open (F-001 this iteration) |
| TC-JSTATS-020 description stale (new iter-3) | ✗ New finding (F-002 this iteration) |
| Type definitions (CommandInvocation, AgentInvocationMetrics, AgentRunResult) | ✓ Correct, doc comments present |
| extractInvocationMetrics: typeof guards, all-undefined case | ✓ Correct, JSON serialization omits undefined |
| mergeFollowUpResult: invocationMetrics survives spread | ✓ Correct (`...baseResult` preserves all fields) |
| success path: extractedMetrics set once after retryWithBackoff | ✓ Correct — set exactly once from final lastResult |
| error subtype (main-work): invocationMetrics included | ✓ Correct (line 836) |
| postWorkPrompts error: invocationMetrics included | ✓ Correct (line 923, extractedMetrics) |
| result-file-not-found: invocationMetrics absent | ⊙ Intentional design decision; no functional impact (error path doesn't write usage.json) |
| executor: propagates invocationMetrics | ✓ Correct (line 520) |
| commit-orchestrator: spread into CommandInvocation | ✓ Correct (line 246) |
| costUsd / measuredCostUsd: independent accumulation, no double-counting | ✓ Correct |
| turns: typeof guard, hasTurns sentinel, null if no invocations | ✓ Correct |
| deriveRunStat: always sets measuredCostUsd and turns (to value or null) | ✓ Verified — return statement includes both fields |
| TC-JSTATS-024b: real 8-field schema verified | ✓ Covers measuredCostUsd + turns from deriveRunStat |
| backward compat: old entries without metrics | ✓ readUsageFile lenient parser, optional fields |
| summary keys unchanged | ✓ buildJobStatsReport summary schema unchanged (D8) |
| managed runtime: no invocationMetrics | ✓ ManagedAgentRunner does not set this field |
| verification result: all 692 test files green | ✓ Confirmed in verification-result.md |
