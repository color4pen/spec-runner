# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### TC-005（should）: redirect超過・timeout経路のaddedTurns明示アサートなし

**Status**: Not fixed — ledger inconsistency  
**Evidence**: `review-feedback-001.md` row 1 shows `Fix: no`. The implementation is correct (all early-return paths now include `addedTurns: ADDED_TURNS_ZERO` per `agent-runner.ts` diff), but the explicit test assertions for redirect超過 and timeout paths individually were not added. The reviewer explicitly decided this was non-blocking and approved without the tests.

This is not a regression (the fix was never applied by design); the ledger entry "fixed during this job" is inconsistent with `Fix: no` in the review-feedback.

### TC-006（should）: result-file-not-found経路の実カウンタ返却を直接アサートするテストなし

**Status**: Not fixed — ledger inconsistency  
**Evidence**: `review-feedback-001.md` row 2 shows `Fix: no`. The implementation correctly returns `{ reportRetry, postWork, outputRepair }` on the result-file-not-found path (line 891-899 of `agent-runner.ts`), but no test directly asserts this counter tuple in that specific path. Reviewer explicitly accepted this as non-blocking (LOW/should).

This is not a regression (the fix was never applied by design); the ledger entry "fixed during this job" is inconsistent with `Fix: no` in the review-feedback.

## Implementation Correctness (observed)

The source code changes are all present and intact:

| Return path | addedTurns in code | Status |
|-------------|--------------------|--------|
| Agent redirect limit exceeded | `ADDED_TURNS_ZERO` | ✅ present |
| Main query failure (non-success subtype) | `ADDED_TURNS_ZERO` | ✅ present |
| post-work turn failure (`postWork++` moved before failure check) | counted before early-return | ✅ present |
| result-file-not-found | `{ reportRetry, postWork, outputRepair }` | ✅ present |
| timeout (AbortError in catch) | `ADDED_TURNS_ZERO` | ✅ present |
| generic catch path | `ADDED_TURNS_ZERO` | ✅ present |

New tests added by this iteration (T-02 group in `agent-runner.test.ts`):
- `post-work failure → completionReason=error and addedTurns.postWork===1` ✅
- `invariant: reportRetry + outputRepair === followUpAttempts` across success / error / postWork paths ✅

## Findings

None. TC-005 and TC-006 remain as open LOW/should test-coverage gaps, explicitly accepted by the reviewer (Fix=no, verdict=approved). No regression has occurred: the implementation is correct, and the test omissions were a deliberate reviewer decision.
