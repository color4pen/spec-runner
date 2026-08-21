# Regression Gate Result — finding-provenance-carry (Iteration 2)

## Evidence

All four findings from the ledger were verified against the current branch code.

---

### [HIGH] `collectSpecReviewLedger` の `filterUndecidedFindings` 追加がタスクに明示されていない

**File**: specrunner/changes/finding-provenance-carry/tasks.md

**Status**: FIXED

**Evidence**: `tasks.md` T-02 now explicitly states:
> Update `collectSpecReviewLedger` to call `filterUndecidedFindings` per StepRun (mirroring the per-run exclusion already applied in `collectFindingsLedger` at line 55). Without this, a spec-review-origin finding disposed via wontfix (step="spec-review") would still appear in `computeRegressionLedger` → merged ledger, causing TC-008 to fail for spec-review-origin cases.

The actual implementation in `src/core/pipeline/findings-ledger.ts` line 156 confirms `filterUndecidedFindings` is called in `collectSpecReviewLedger`:
```ts
const active = filterUndecidedFindings(STEP_NAMES.SPEC_REVIEW, fixable, state.decisions);
```

---

### [HIGH] TC-001 (must) — buildMessage の provenance ref 出力をテストで固定していない

**File**: src/core/step/__tests__/regression-gate-step.test.ts

**Status**: FIXED

**Evidence**: `regression-gate-step.test.ts` lines 236–254 now contains a test explicitly asserting the provenance ref appears in `buildMessage` output:
```ts
it("message contains the provenance ref for each ledger entry (TC-001)", () => {
  // ...
  const expectedRef = computeLedgerRef(finding);
  const msg = step.buildMessage(state, deps);
  expect(msg).toContain(expectedRef);
});
```
This pins the `buildLedgerEntry` contract: removing the ref line from `buildLedgerEntry` will cause this test to fail.

---

### [MEDIUM] TC-011 の等式は collectSpecReviewLedger の新フィルタ挙動（decisions 有り状態）を assert していない

**File**: src/core/step/__tests__/regression-gate-false-loop.test.ts:200

**Status**: FIXED

**Evidence**: `regression-gate-false-loop.test.ts` lines 233–273 now add a fourth TC-011 case that tests `decisions`-present state:
```ts
it("TC-011: decisions あり状態で spec-review disposed finding は collectSpecReviewLedger から除外される", () => {
  // ...
  const stateWithDecision: JobState = { ...baseState, decisions: [{ kind: "disposition", ... }] };
  const specLedger = collectSpecReviewLedger(stateWithDecision);
  expect(specLedger).toHaveLength(0);
  const ledger = computeRegressionLedger([], stateWithDecision);
  expect(ledger).toHaveLength(0);
});
```
This verifies the new contract — `collectSpecReviewLedger` with decisions excludes disposed findings — rather than only verifying the `undefined`-decisions case.

---

### [LOW] shared findingSchema への ledgerRef 追加により gate 専用フィールドが non-gate judge step の JSON Schema にも露出する

**File**: src/core/step/report-tool.ts:111

**Status**: FIXED

**Evidence**: `JUDGE_REPORT_TOOL` description string in `src/core/step/report-tool.ts` line 111 now includes an explicit scoping note:
> Optional finding field: 'ledgerRef' (string) — regression-gate exclusive; only the regression-gate step populates this field (provenance ref echo). All other judge steps (spec-review, custom reviewers) must leave ledgerRef absent.

This addresses the design intent D5 gap by making the gate-exclusive nature of `ledgerRef` explicit to the LLM in the tool description.

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| `collectSpecReviewLedger` の `filterUndecidedFindings` 追加がタスクに明示されていない | HIGH | FIXED |
| TC-001 — buildMessage の provenance ref 出力をテストで固定していない | HIGH | FIXED |
| TC-011 の等式は collectSpecReviewLedger の新フィルタ挙動（decisions 有り状態）を assert していない | MEDIUM | FIXED |
| shared findingSchema への ledgerRef 追加により gate 専用フィールドが non-gate judge step の JSON Schema にも露出する | LOW | FIXED |

No regressions detected. All findings have been addressed.
