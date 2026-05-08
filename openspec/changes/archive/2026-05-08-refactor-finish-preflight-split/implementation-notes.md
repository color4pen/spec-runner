# Implementation Notes — refactor-finish-preflight-split

- **result**: completed
- **tasks_completed**: 7/7

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/finish/spawn-helper.ts` | created | spawnOrEscalate helper + SpawnOrEscalateResult type |
| `src/core/finish/pr-status.ts` | created | fetchPrViewWithRetry, pollMergeStateAfterPush, PrViewFetchResult type, polling constants |
| `src/core/finish/branch-checkout.ts` | created | checkoutForValidation, restoreBranch with warnFn DI, uses spawnOrEscalate for git rev-parse |
| `src/core/finish/types.ts` | modified | Added PrViewData interface (moved from preflight.ts to break circular dep per spec-review finding #1) |
| `src/core/finish/preflight.ts` | modified | Shrunk 504→248 lines; removed moved code; added warnFn DI; imports from pr-status.ts + branch-checkout.ts; removed ForTest re-exports |
| `src/core/finish/orchestrator.ts` | modified | Updated imports (pr-status.js direct, spawnOrEscalate); 6 spawn calls replaced with spawnOrEscalate; removed ForTest alias imports |
| `tests/unit/core/finish/preflight.test.ts` | modified | Updated imports: fetchPrViewWithRetry/pollMergeStateAfterPush from pr-status.js; removed ForTest suffix; TC-CHECKOUT-4 uses warnFn DI instead of process.stderr.write patching |
| `tests/unit/core/finish/spawn-helper.test.ts` | created | TC-01, TC-02, TC-03, TC-04, TC-34 for spawnOrEscalate |
| `tests/unit/core/finish/branch-checkout.test.ts` | created | TC-11, TC-12, TC-13 for checkoutForValidation and restoreBranch |
| `openspec/changes/refactor-finish-preflight-split/tasks.md` | modified | All tasks marked [x] |

## Blocked Tasks

None. All 7 tasks completed.

## Notes

- **PrViewData moved to types.ts**: The spec-review finding #1 (MEDIUM) flagged a circular dependency where pr-status.ts would import PrViewData from preflight.ts while preflight.ts imports from pr-status.ts. Resolved by moving PrViewData to types.ts (consistent with existing ResolvedTarget, FinishFs pattern). Both preflight.ts and pr-status.ts re-export it.

- **openspec validate uses direct spawn + formatEscalation**: The custom recommendedAction for openspec validate includes the stderr output (`Fix spec validation errors:\n${stderr}`). Since spawnOrEscalate constructs its default recommendedAction without knowing what the custom message will contain, and we need stderr content in the message, the openspec validate check uses direct spawn + formatEscalation rather than spawnOrEscalate. This is consistent with the design's "非適用箇所" rationale pattern.

- **spawnOrEscalate count**: orchestrator.ts (6 uses) + branch-checkout.ts (1 use) = 7 total. preflight.ts has 0 direct uses (openspec validate uses direct spawn for custom error formatting). Satisfies TC-20 (orchestrator ≥ 5) and TC-31 (≥ 5 combined).

- **TC-CHECKOUT-4 updated**: The original test patched process.stderr.write directly. Updated to use the new warnFn DI, which is cleaner and doesn't require global state mutation in tests.
