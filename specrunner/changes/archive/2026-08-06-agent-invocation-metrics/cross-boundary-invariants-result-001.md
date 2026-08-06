# Cross-Boundary Invariants Review — agent-invocation-metrics

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Change**: specrunner/changes/agent-invocation-metrics

---

## Scope Walked

| Layer | Files Examined |
|-------|---------------|
| Core types | `src/core/usage/types.ts`, `src/core/port/agent-runner.ts` |
| Adapter | `src/adapter/claude-code/agent-runner.ts` (full follow-up loop), `src/adapter/claude-code/query-one-shot.ts` |
| Wiring | `src/core/step/executor.ts`, `src/core/step/commit-orchestrator.ts` |
| Commands | `src/core/command/job-stats.ts`, `src/core/command/usage-show.ts` |
| Persistence | `src/core/usage/store.ts` |
| Tests | `tests/unit/core/command/job-stats.test.ts` (existing), `job-stats-metrics.test.ts` (new) |

---

## Findings

### F-001 [HIGH] `totalCostUsd` in job-stats drops follow-up turn costs, breaking the existing all-turn cost accounting invariant

**File**: `src/adapter/claude-code/agent-runner.ts:509,861` / `src/core/command/job-stats.ts:179-203`

**Rationale**:

The existing invariant is: every token in `extractedModelUsage` contributes to the step's cost entry. The follow-up loops (postWorkPrompts at line 936-946, outputVerification at line 984-994) explicitly ACCUMULATE follow-up turn token usage into `extractedModelUsage`. The comment at line 933-935 states this explicitly:

> 真の総コスト = 作業 query + 全 follow query の加算 (= per-model sum)

`extractedMetrics` is set ONCE from the main work result (line 861) and is **never updated** in the follow-up loops. When `totalCostUsd` is present, `job-stats.ts:183` takes it exclusively:

```typescript
if (typeof invRaw.totalCostUsd === "number") {
  total += invRaw.totalCostUsd;  // main-turn cost only
  hasMeasured = true;
} else if (inv.modelUsage) {     // ALL-turn accumulated usage — skipped!
  ...
}
```

For any step with follow-up turns (postWorkPrompts from rules system, report_result retries), the `modelUsage` in the written `CommandInvocation` is the FULL accumulated token count, but when `totalCostUsd` is present, `job-stats` uses only the main-turn cost and ignores the full-turn token data. The SDK's per-query `total_cost_usd` is invocation-scoped, not session-cumulative.

Because `buildRulesFollowUpPrompts` injects postWorkPrompts for virtually all pipeline steps (when rules files exist), this undercount applies to essentially every step in a normal SpecRunner dogfooding run. A step with 1 main turn + 3 rule follow-ups would have its cost underestimated by the follow-up proportion.

The design acknowledges this in the Risks section ("Known Limitation") but the consequence is that `totalCostUsd`-based cost reporting can be LESS accurate than the old `computeCostUsd(model, fullModelUsage)` approach for multi-turn steps. The stated benefit of "real measured cost" is partially illusory for the common case.

**Options**:
- **Fix now**: In the follow-up success branches (postWorkPrompts and outputVerification repair), accumulate `totalCostUsd` and `numTurns` into `extractedMetrics`, parallel to how `modelUsage` is accumulated at lines 936-946. This follows the same logic already documented in the comment at line 933-935.
- **Accept and document**: Keep the Known Limitation as-is, and strengthen the doc comment on `CommandInvocation.totalCostUsd` to warn that it reflects main-work-turn only (not full accumulated cost for the step).

---

### F-002 [MEDIUM] `numTurns` systematically underrepresents actual SDK turn count for multi-turn steps

**File**: `src/adapter/claude-code/agent-runner.ts:509,861` / `src/core/command/job-stats.ts:199-202`

**Rationale**:

Same root cause as F-001. `extractedMetrics.numTurns` is from the main work turn result only. Follow-up turns (postWorkPrompts, report_result retries, outputVerification repair) each produce their own SDK query with their own `num_turns`, but these are not accumulated into `extractedMetrics`.

The `addedTurns` field on `AgentRunResult` tracks extra turns by type (`reportRetry`, `postWork`, `outputRepair`), but these are not added to `numTurns`. So `job stats` reports `turns` that may be substantially less than the actual total API turns for the step.

For example, a step with `addedTurns.postWork = 3` means 3 additional SDK queries ran, each with their own `num_turns`, none of which are reflected in `numTurns`.

**Options**:
- **Fix now**: Accumulate `num_turns` from follow-up result messages into `extractedMetrics.numTurns`, symmetric to the `total_cost_usd` accumulation in F-001's fix option.
- **Accept**: Add a doc comment to `CommandInvocation.numTurns` clarifying it reflects main-work-turn only; update `job stats` output to indicate this limitation.

---

### F-003 [MEDIUM] TC-JSTATS-024 ("row keys match spec") now tests a stale schema, silently weakening the row schema contract

**File**: `tests/unit/core/command/job-stats.test.ts:489-496`

**Rationale**:

TC-JSTATS-024 was established as the schema gate for `JobStatRow` JSON output:
```typescript
expect(rowKeys).toEqual(["convergence", "costUsd", "date", "durationSec", "outcome", "slug"]);
```

The test constructs a hand-crafted row WITHOUT `costBasis` and `turns`, so these fields are absent from the JSON and the 6-field assertion passes. However, the ACTUAL output of `deriveRunStat` (the real code path) **always** sets both `costBasis` and `turns` (to a value or `null`), producing 8-field rows.

The test continues to pass but no longer verifies what it claims to verify: it tests the schema of an artificial object, not the schema of the real `deriveRunStat` output. A developer reading TC-JSTATS-024 as documentation for the row schema will get an incorrect, incomplete picture.

The design explicitly accepts this as a trade-off (D8) to preserve AC#10 (no modification of existing tests). The new fields are covered by separate new tests (TC-JSTATS-021/022/023). However, two sources of truth now exist for the row schema, and TC-JSTATS-024's label ("row keys match spec") is misleading.

**Options**:
- **Update TC-JSTATS-024**: Change the hand-crafted row to use a `deriveRunStat()` call so the schema is always the real output (but this would violate AC#10).
- **Add a new schema test**: Add a test called "deriveRunStat row keys include costBasis and turns" alongside TC-JSTATS-024 to close the gap without modifying the existing test.
- **Accept**: Keep the current state and accept that TC-JSTATS-024 tests only the legacy subset; rely on TC-JSTATS-021/022/023 for the new fields.

---

### F-004 [LOW] Follow-up postWorkPrompts error return lacks `invocationMetrics` despite `extractedMetrics` being set

**File**: `src/adapter/claude-code/agent-runner.ts:913-927`

**Rationale**:

The doc comment on `AgentRunResult.invocationMetrics` states:
> Populated by ClaudeCodeRunner (local runtime) for both success and error subtypes.

The main-work error return at line 826-842 correctly includes `invocationMetrics: extractInvocationMetrics(errorResult...)`. However, the postWorkPrompts error return at line 913-927 does NOT include `invocationMetrics`, even though `extractedMetrics` IS available at that point (the main work turn succeeded, setting `extractedMetrics` at line 861).

This is inconsistent with the documented contract. Any consumer of `AgentRunResult` for error cases may find `invocationMetrics` undefined for this specific error path despite the type-level promise.

**Fix**: Add `invocationMetrics: extractedMetrics` to the postWorkPrompts error return object at line 913-927. `extractedMetrics` is in scope and already set.

---

### F-005 [LOW] Redundant `as unknown as` casts in job-stats.ts and usage-show.ts bypass type safety unnecessarily

**File**: `src/core/command/job-stats.ts:182`, `src/core/command/usage-show.ts:67`

**Rationale**:

`CommandInvocation` already declares `totalCostUsd?: number`, `numTurns?: number`, `durationMs?: number`, `durationApiMs?: number` as optional typed fields. Despite this, both files cast `inv` through `unknown`:

```typescript
// job-stats.ts:182
const invRaw = inv as unknown as { totalCostUsd?: unknown; numTurns?: unknown };

// usage-show.ts:67
const invRaw = inv as unknown as { numTurns?: number; durationMs?: number; durationApiMs?: number; totalCostUsd?: number };
```

The `job-stats.ts` variant additionally weakens the field types to `unknown` (vs. the correct `number | undefined`), which loses TypeScript's ability to catch future type mismatches. These casts are redundant: `inv.totalCostUsd` is already accessible as `number | undefined` without any cast. The `typeof === "number"` guards work identically on the typed fields.

**Fix**: Remove the `invRaw` variable and use `inv.numTurns`, `inv.totalCostUsd`, etc. directly. The `typeof === "number"` guards provide the same runtime safety.

---

## Observations

**O-1**: `deriveFromJobState` in `src/core/usage/store.ts:58` constructs `CommandInvocation` entries from `JobState.StepRun` but cannot include `numTurns`, `durationMs`, `durationApiMs`, or `totalCostUsd` because these are not stored in `StepRun`. If this function is ever called for migration or repair, the reconstructed entries will silently lack metrics. The design explicitly deferred this (no production callers), but no warning is present in the code.

**O-2**: The `turnCount?` field in `QueryOneShotResult` is deprecated (line 75-78) and marked "never set in returned objects." The existing test "turnCount is undefined (reserved for future use)" (query-one-shot.test.ts:90-99) still passes vacuously. The test description is now stale but causes no correctness issue.

**O-3**: The `extractedMetrics` accumulation follows `extractedModelUsage`'s precedent for the main work turn, but diverges for follow-up turns. This asymmetry between `modelUsage` (accumulated) and `invocationMetrics` (static) is the root of F-001 and F-002. Documenting this asymmetry in the agent-runner.ts follow-up loops would help future maintainers.

---

## Evidence Summary

| Item | Status |
|------|--------|
| Type definitions (CommandInvocation, AgentInvocationMetrics, AgentRunResult) | ✓ Correct, doc comments present |
| extractInvocationMetrics helper — typeof guards | ✓ Correct for main work turn |
| success path: extractedMetrics set and propagated to baseResult | ✓ Correct |
| error subtype: main-work error includes invocationMetrics | ✓ Correct |
| postWorkPrompts error: includes invocationMetrics | ✗ Missing (F-004) |
| follow-up loops: totalCostUsd/numTurns accumulated from follow-up turns | ✗ Not accumulated (F-001, F-002) |
| executor: propagates invocationMetrics to StepExecutionResult | ✓ Correct |
| commit-orchestrator: spread invocationMetrics into CommandInvocation | ✓ Correct |
| job-stats: if/else if prevents double-counting per invocation | ✓ Correct |
| job-stats: totalCostUsd takes priority over modelUsage per invocation | ✓ Implemented (creates F-001) |
| TC-JSTATS-024 schema gate covers new fields | ✗ Hand-crafted row bypasses new fields (F-003) |
| deriveRunStat always sets costBasis and turns | ✓ Correct |
| backward compat: old entries without metrics fields | ✓ readUsageFile is lenient |
| as-unknown-as casts redundant | ✗ Minor type safety smell (F-005) |
