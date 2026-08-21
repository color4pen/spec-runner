# Regression Gate Result — finding-provenance-carry iteration 1

## Ledger Verification

### [HIGH] `collectSpecReviewLedger` の `filterUndecidedFindings` 追加がタスクに明示されていない
- **Status**: FIXED
- **Evidence**:
  - `tasks.md` T-02 now explicitly includes: `[x] Update collectSpecReviewLedger to call filterUndecidedFindings per StepRun (mirroring the per-run exclusion already applied in collectFindingsLedger at line 55). Without this, a spec-review-origin finding disposed via wontfix (step="spec-review") would still appear in computeRegressionLedger → merged ledger, causing TC-008 to fail for spec-review-origin cases.`
  - `src/core/pipeline/findings-ledger.ts` `collectSpecReviewLedger` now calls `filterUndecidedFindings` (line 153-155 in changed file).
  - `tests/unit/core/decision/wontfix.test.ts` TC-008 (new) at line 767-805 covers both impl-chain-origin and spec-review-origin DispositionDecisionRecords, including: "disposed spec-review finding is absent from collectSpecReviewLedger" (line 781) and "disposed spec-review finding is absent from computeRegressionLedger" (line 794).

### [HIGH] TC-001 (must) — buildMessage の provenance ref 出力をテストで固定していない
- **Status**: FIXED
- **Evidence**:
  - `src/core/step/__tests__/regression-gate-step.test.ts` now includes at line 234-253: `it("message contains the provenance ref for each ledger entry (TC-001)", ...)` which imports `computeLedgerRef` from `findings-ledger.ts`, computes `expectedRef = computeLedgerRef(finding)`, and asserts `expect(msg).toContain(expectedRef)`. This pins the `buildLedgerEntry` contract.

### [MEDIUM] TC-011 の等式は collectSpecReviewLedger の新フィルタ挙動（decisions 有り状態）を assert していない
- **Status**: STILL PRESENT
- **Evidence**:
  - `src/core/step/__tests__/regression-gate-false-loop.test.ts` was NOT modified (git diff shows no changes to this file).
  - TC-011 tests (lines 187-231) only exercise state without `decisions` field — no test case with decisions present was added.
  - No comment was added to clarify that the tests intentionally cover only the undecided state.
  - The finding's two suggested resolutions (add a decisions-present case OR add a clarifying comment) remain unimplemented.

### [LOW] shared findingSchema への ledgerRef 追加により gate 専用フィールドが non-gate judge step の JSON Schema にも露出する
- **Status**: STILL PRESENT
- **Evidence**:
  - `src/core/step/report-tool.ts` line 111 (`JUDGE_REPORT_TOOL` description) does not mention that `ledgerRef` is a regression-gate exclusive field. The description ends with the existing wording unchanged, and no note about `ledgerRef` being gate-only was added.
  - The `ledgerRef: optional(string())` field is present in the shared `findingSchema` (line 85) which is used by `JUDGE_REPORT_TOOL`, `CODE_REVIEW_REPORT_TOOL`, and `REQUEST_REVIEW_REPORT_TOOL`, but none of their descriptions notes it as gate-exclusive.

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| `collectSpecReviewLedger` filterUndecidedFindings がタスクに明示されていない | HIGH | FIXED |
| TC-001 buildMessage provenance ref テスト欠如 | HIGH | FIXED |
| TC-011 decisions あり状態の検証不足 | MEDIUM | STILL PRESENT |
| ledgerRef が non-gate judge step JSON Schema に露出 | LOW | STILL PRESENT |
