# Regression Gate Result — Iteration 002

## Evidence Summary

- **Checked**: 4 findings
- **Regressions detected**: 1 (Finding 4)

---

## Finding 1 (LOW): stale comment ROUND_ALL_MEMBERS_SKIPPED at helpers.ts:122

**Status**: ✅ Fixed

`git diff main...HEAD -- src/state/helpers.ts` confirms the ROUND_ALL_MEMBERS_SKIPPED wording was removed from the NOTE comment in `pushStepResult`. The old text "pipeline.ts relies on this 'sticky' behaviour to detect ROUND_ALL_MEMBERS_SKIPPED at the end-of-pipeline check" is gone.

---

## Finding 2 (LOW): implementation-notes.md missing

**Status**: ✅ Fixed

`specrunner/changes/round-all-skip-pass-through/implementation-notes.md` exists and lists all tests whose expectations were updated (reviewer-status.test.ts, parallel-review-round-canon.test.ts, reviewer-activation-e2e.test.ts) with before/after expected values.

---

## Finding 3 (MEDIUM): Stale comment names removed ROUND_ALL_MEMBERS_SKIPPED terminal invariant

**Status**: ✅ Fixed

Same fix as Finding 1. The NOTE comment no longer references ROUND_ALL_MEMBERS_SKIPPED or the terminal seam in pipeline.ts.

---

## Finding 4 (LOW): sticky-error comment cites a use case that does not occur at runtime

**Status**: ❌ REGRESSION — not fixed

The current comment at `src/state/helpers.ts:122–126` reads:

```
This is intentional: error codes such as
ROUND_NONDECLARED_CHANGE set by commitRound remain present after later steps
(regression-gate / conformance / pr-create) so the end-of-pipeline check can
act on them.
```

Finding 4 identified this exact text as inaccurate: ROUND_NONDECLARED_CHANGE causes the coordinator to return `"escalation"` with no matching coordinator-escalation transition → `nextStep = "escalate"` → pipeline stops at `awaiting-resume` immediately. The later steps (regression-gate / conformance / pr-create) **never run**. The fix for Findings 1/3 removed ROUND_ALL_MEMBERS_SKIPPED but replaced it with ROUND_NONDECLARED_CHANGE — the same inaccurate example that Finding 4 explicitly flagged.

The sticky-error mechanism itself is real and correctly implemented; the cited example use case is still misleading.

**Required fix**: Rewrite the NOTE to describe the sticky mechanism without citing ROUND_NONDECLARED_CHANGE (or any other error code that stops the pipeline before those later steps run), or accurately describe the class of errors for which stickiness matters.
