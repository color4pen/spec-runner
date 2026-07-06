# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

Both findings were marked **Fix: no** in `review-feedback-001.md` (the code reviewer accepted them as low-severity, non-blocking issues and did not route to a code-fixer). Since neither was supposed to be fixed, verifying "still fixed" reduces to confirming the code is in the same accepted state.

### [LOW] TC-017: endedAt absent フォールバックパスが実際には未踏

**File**: `src/core/job-list/__tests__/operations-view.test.ts:158-173`

Current state:
- `describe` title: "falls back to startedAt when endedAt absent" — still present
- `it` description: **updated** to "uses startedAt when endedAt matches (simulating absent by using same value)" — acknowledges the simulation honestly
- `??` path in `run.endedAt ?? run.startedAt` is still not directly exercised (`endedAt` is provided as same value as `startedAt`, not omitted)

This is the same state as when the code reviewer gave "approved" with Fix: no. No code-fixer was invoked. **Not a regression.**

### [LOW] TC-032: checkPrMerged 呼び出し回数を検証せず / vi.hoisted が describe 内にある

**File**: `tests/unit/cli/ps-filter.test.ts:359-393`

Current state:
- `vi.hoisted(() => vi.fn())` at line 360: still inside the `describe` block
- `vi.mock(...)` at line 362: still inside the `describe` block
- Call count not asserted; comment "may or may not be called" still present at line 386

This is the same state as when the code reviewer gave "approved" with Fix: no. No code-fixer was invoked. **Not a regression.**

## Findings (regressions)

None. Both ledger items were intentionally left unfixed (`Fix: no`) at the approved code review stage. Their presence in the current code is expected and unchanged.
