# Regression Gate — Evidence Report (Iteration 2)

## Finding 1: [LOW] buildParallelReviewerTransitions — regression-gate approved+fixable→code-fixer transition

**File**: `src/core/pipeline/reviewer-chain.ts:406`

**Verification**: FIXED

The regression-gate section in `buildParallelReviewerTransitions` (lines 408–426) now contains only three rows:
- `approved → conformance`
- `needs-fix → code-fixer`
- `skipped → conformance`

No "approved (fixable) → code-fixer" row for regression-gate exists. The docstring at lines 327–329 explicitly documents: "regression-gate approved (fixable) → code-fixer is structurally unreachable after D2 … That row has been removed."

---

## Finding 2: [MEDIUM] regression-gate buildMessage の severity=high 指示

**File**: `src/core/step/regression-gate.ts:160`

**Verification**: FIXED

Line 160 now reads:

```
3. Report any regressions (findings that are back) with the severity from the ledger entry / resolution=fixable. The ledger includes all severities (LOW, MEDIUM, HIGH, CRITICAL) — report each regression with its actual severity.
```

The old "severity=high" instruction has been replaced with ledger-based severity instructions that correctly handle LOW entries.

---

## Finding 3: [LOW] regressionGateActive の approved+fixable 分岐が dead code 化

**File**: `src/core/pipeline/reviewer-chain.ts:272`

**Verification**: FIXED

`regressionGateActive` (lines 268–274) now simply returns `last.outcome.verdict === "needs-fix"` with no approved+fixable branch. The function comment (lines 264–266) documents: "The approved+fixable branch is structurally unreachable and has been removed."

---

## Summary

| Finding | File | Line | Status |
|---------|------|------|--------|
| LOW — dead transition row in buildParallelReviewerTransitions | reviewer-chain.ts | 406 | **Fixed** |
| MEDIUM — severity=high prompt not updated for LOW entries | regression-gate.ts | 160 | **Fixed** |
| LOW — regressionGateActive approved+fixable dead branch | reviewer-chain.ts | 272 | **Fixed** |

All three findings have been addressed. No regressions detected.
