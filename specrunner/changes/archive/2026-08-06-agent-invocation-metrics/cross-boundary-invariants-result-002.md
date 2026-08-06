# Cross-Boundary Invariants Review — agent-invocation-metrics

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Change**: specrunner/changes/agent-invocation-metrics

---

## Scope Walked

| Layer | Files Examined |
|-------|---------------|
| Core types | `src/core/usage/types.ts`, `src/core/port/agent-runner.ts` |
| Adapter | `src/adapter/claude-code/agent-runner.ts` (full, lines 383–1070), `src/adapter/claude-code/query-one-shot.ts` |
| Wiring | `src/core/step/executor.ts:505-522`, `src/core/step/commit-orchestrator.ts:56-93, 215-251` |
| Commands | `src/core/command/job-stats.ts` (full), `src/core/command/usage-show.ts` (full) |
| Persistence | `src/core/usage/store.ts` |
| Tests (new) | `job-stats-metrics.test.ts`, `job-stats.test.ts` (added TC-JSTATS-024b) |
| Review artifacts | `review-feedback-002.md`, `cross-boundary-invariants-result-001.md` |

---

## Resolution of Iteration 1 Findings

### F-001 [HIGH → RESOLVED]  Follow-up turn cost drop

The iteration 1 implementation had `totalCostUsd` take priority in `costUsd`, silently dropping follow-up turn token costs. The current implementation eliminated this by keeping `costUsd` as `computeCostUsd(modelUsage)` for ALL invocations (`modelUsage` IS accumulated across follow-up turns in the agent-runner), and introducing `measuredCostUsd` as a parallel independent field. The invariant — "every token in `extractedModelUsage` contributes to the step's cost entry" — is now preserved. ✓

### F-004 [LOW → RESOLVED]  postWorkPrompts error return missing `invocationMetrics`

`agent-runner.ts:923` now correctly includes `invocationMetrics: extractedMetrics` in the postWorkPrompts error return branch. ✓

### F-005 [LOW → RESOLVED]  Redundant `as unknown as` casts

Both `job-stats.ts` and `usage-show.ts` now access `inv.numTurns`, `inv.totalCostUsd`, etc. as direct typed fields with `typeof === "number"` guards. The intermediate `invRaw` casts are gone. ✓

---

## Findings

### F-001 [MEDIUM] `costUsd` was not changed to measured-first per AC #7 and design D6

**File**: `src/core/command/job-stats.ts:182-193`

The request AC #7 specifies: "job stats の costUsd が、totalCostUsd を持つ invocation については実測値を、持たない invocation については computeCostUsd の試算を使い" — `costUsd` itself should switch to measured values when available. Design D6 specified per-invocation if/else priority logic with `costBasis?: "measured" | "estimated" | "mixed" | null` on `JobStatRow`. Tasks T-06 lists the per-invocation priority logic explicitly.

The current implementation instead:
- Keeps `costUsd` as the pricing-table estimate for **all** invocations (no change from pre-feature behavior)
- Adds `measuredCostUsd` as an independent parallel field (sum of `totalCostUsd`)
- Does NOT add `costBasis`

TC-010 comment explicitly documents this as intended: "Design: costUsd uses computeCostUsd(modelUsage) independent of totalCostUsd." This is a deliberate divergence from the accepted design.

**Why the implementation diverges**: the design's priority approach would have produced a `costUsd` that excludes follow-up turn costs (as F-001 in iteration 1 showed), making it LESS accurate than the old estimate for multi-turn steps. The parallel-column approach avoids that regression and is arguably better engineering.

**Cross-boundary impact**: the existing `costUsd` invariant (pricing-table estimate) is preserved — no existing consumer is broken. However, the accepted AC #7 contract is not honored, and `costBasis` (specified in the design) is absent from the JSON output schema.

**Options**:
- **Accept current design**: Treat `measuredCostUsd` as the resolution of AC #7's intent — measured cost is now visible, just in a parallel column rather than replacing `costUsd`. Update the design to reflect this (D6 revision). Note that `costBasis` absence means JSON consumers cannot determine via a single field whether measured cost is available.
- **Implement AC #7 as written**: Change `costUsd` to priority-measured (per-invocation if/else), add `costBasis`, remove or keep `measuredCostUsd`. Requires re-examining the follow-up turn cost accuracy issue that triggered this design change.

---

### F-002 [LOW] TC-JSTATS-024 title claims "row keys match spec" but tests a stale 6-field schema

**File**: `tests/unit/core/command/job-stats.test.ts:489-496`

TC-JSTATS-024 uses a hand-crafted `JobStatRow` (no `measuredCostUsd`, no `turns`) and asserts `rowKeys === ["convergence","costUsd","date","durationSec","outcome","slug"]`. The real `deriveRunStat` output has 8 fields: `measuredCostUsd` and `turns` are always set (to a value or `null`), as TC-JSTATS-024b (added in this iteration) correctly documents.

TC-JSTATS-024's label "row keys match spec" implies it is the definitive schema gate, but it cannot catch new required-in-practice fields added to `deriveRunStat` because the hand-crafted row bypasses `deriveRunStat`. TC-JSTATS-024b closes the gap for the real 8-field schema. The two tests create two parallel schema authorities.

**Fix**: rename TC-JSTATS-024 to "hand-crafted row (6-field, without optional fields) serializes to 6 keys" to distinguish it from TC-JSTATS-024b and prevent future maintainers from treating it as the definitive schema gate.

---

## Observations

**O-1**: `extractInvocationMetrics` at line 383 returns an object with explicit `undefined` values for absent fields (e.g. `{ numTurns: undefined, ... }`). When spread into the `CommandInvocation` literal via `...(invocationMetrics ?? {})`, these keys are present at runtime but omitted by `JSON.stringify`. This means usage.json correctly stores only the fields that carried real values. The behavior is correct but subtle — the spread includes `undefined`-valued keys that are invisible post-serialization.

**O-2**: Summary aggregation (`buildJobStatsReport`) does not include `measuredCostUsd` or `turns` aggregates. Intentional per D8 ("summary schema は変えない"). Users who want total measured costs or total turns must sum the rows manually. The table shows per-run "SDK $" and "Turns" columns but the summary footer only shows pricing-table cost aggregates.

**O-3**: `renderJobStatsTable` uses `!= null` for `measuredCostUsd` (catches both `null` and `undefined`) but `!== null` for `costUsd` (catches only `null`). Since `costUsd` is a required field in `JobStatRow` and can only be `null | number`, this inconsistency is harmless but slightly uneven.

**O-4**: The doc comment on `CommandInvocation.totalCostUsd` explicitly warns "For all-turn cost, use modelUsage with computeCostUsd — modelUsage accumulates all turns in agent-runner." This correctly points consumers toward the more complete cost estimate. However, for unknown-model runs (e.g. `claude-opus-5`), `computeCostUsd` returns `null` and `totalCostUsd` is the only available cost value — making the "all-turn cost via modelUsage" guidance incomplete for unknown models. This is a documentation gap, not a code defect.

---

## Evidence Summary

| Item | Status |
|------|--------|
| Iteration 1 F-001 (follow-up cost drop) | ✓ RESOLVED — design changed, costUsd uses modelUsage (all-turn) |
| Iteration 1 F-004 (postWorkPrompts error invocationMetrics) | ✓ RESOLVED — line 923 sets extractedMetrics |
| Iteration 1 F-005 / iter-2-feedback F-003 (redundant casts) | ✓ RESOLVED — both files use typed field access |
| iter-2-feedback F-001 (deriveRunStat JSDoc) | ✓ RESOLVED — JSDoc now documents measuredCostUsd, turns, main-work-only scope |
| iter-2-feedback F-002 (table doesn't show costBasis) | ✓ RESOLVED by design change — costBasis replaced by SDK $ column |
| Iteration 1 F-002 (numTurns underrepresents actual turns) | ⊙ Known limitation, documented in CommandInvocation.numTurns doc comment |
| Iteration 1 F-003 / TC-JSTATS-024 stale schema gate | ⊙ Partially addressed by TC-JSTATS-024b; TC-JSTATS-024 title remains misleading (F-002) |
| AC #7: costUsd measured-first | ✗ Not implemented — parallel column approach used instead (F-001) |
| AC #8: costBasis field | ✗ costBasis absent; measuredCostUsd column used as substitute |
| Type definitions (CommandInvocation, AgentInvocationMetrics) | ✓ Correct, doc comments present |
| extractInvocationMetrics typeof guards | ✓ Correct |
| success path: extractedMetrics set and propagated | ✓ Correct |
| error subtype (main-work): invocationMetrics included | ✓ Correct (line 836) |
| postWorkPrompts error: invocationMetrics included | ✓ Correct (line 923, extractedMetrics) |
| executor: propagates invocationMetrics | ✓ Correct (line 520) |
| commit-orchestrator: spread into CommandInvocation | ✓ Correct (line 246) |
| backward compat: old entries without metrics | ✓ readUsageFile lenient parser |
| costUsd existing behavior preserved | ✓ Unchanged (pricing-table estimate) |
| summary.costUsdTotal aggregates costUsd | ✓ Correct (unchanged) |
| measuredCostUsd null for hand-crafted rows in table | ✓ Correct (!= null catches undefined) |
| TC-JSTATS-024b: real 8-field schema verified | ✓ Added, covers measuredCostUsd + turns |
