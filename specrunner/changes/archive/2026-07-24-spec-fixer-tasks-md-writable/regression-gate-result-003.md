# Regression Gate Result — Iteration 3

**Change**: spec-fixer-tasks-md-writable  
**Date**: 2026-07-23  
**Ledger items**: 3  

---

## Evidence

### Finding 1 (MEDIUM): spec-fixer 責任範囲テーブルが stale（tasks.md が Touch 可能に含まれていない）

**File**: `src/prompts/rules.ts:47`  
**Status**: FIXED ✓

`src/prompts/rules.ts` line 47 now reads:

```
| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |
```

`tasks.md` is present in the Touch 可能 column. System prompt (write-set) and rules context are now consistent.

---

### Finding 2 (LOW): TC-012 first sub-test の it(...) タイトルと inline comment が旧 routable 集合を断言している

**File**: `src/core/step/__tests__/spec-review-fixer-routing.test.ts:844`  
**Status**: FIXED ✓

Line 844 `it(...)` title updated from  
`"only spec.md and design.md fixable findings are returned"`  
to  
`"only spec-fixer-writable fixable findings are returned (request.md and src/ excluded)"`

Line 858 comment updated from  
`"// Only spec.md and design.md are routable"`  
to  
`"// spec.md and design.md are routable (tasks.md also routable but not in this test data)"`

Test logic is correct: `toHaveLength(2)` is still accurate because no tasks.md finding exists in the test data, and the comment now correctly acknowledges tasks.md is routable while explaining why it is absent.

---

### Finding 3 (LOW): FAST pipeline: tasks.md conformance findings lose CANON_FINDING_ESCALATION diagnostic after write-set expansion

**File**: `src/core/step/step-completion.ts:300`  
**Status**: FIXED ✓

The required fix was: "add a note in design.md D3 documenting the FAST diagnostic impact, or add a test pinning the FAST no-transition escalation path for tasks.md."

`specrunner/changes/spec-fixer-tasks-md-writable/design.md` D3 (lines 115–123) now contains a detailed note:

> Consequence (FAST pipeline): `FAST_TRANSITIONS` intentionally has no `needs-fix:spec-fixer` row, so a fixable conformance finding on tasks.md with `fixTarget: spec-fixer` now derives `needs-fix:spec-fixer` and falls through the no-matching-transition default to the `escalate` terminal. Unlike the previous unroutable-canon escalation, this path does NOT set `escalationReason` (the verdict at derivation time is `needs-fix:spec-fixer`, not `escalation`). The FAST profile still fails closed — the job halts — but the operator sees a plain escalation without a CANON_FINDING_ESCALATION reason.

The note satisfies the "add a note in design.md D3" branch of the fix requirement.

**Observation**: D3 additionally claims "This behavior is pinned by a FAST-profile test so the reason-less halt is a documented contract, not an accident." No such FAST-profile test exists in the current test suite (searched `tests/` for `FAST.*tasks`, `FAST.*no-transition`, `reason-less`, `FAST_TRANSITIONS`). The claim is inaccurate. The diagnostic impact IS documented in D3, satisfying the fix, but the stated test pin is absent.

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | MEDIUM | Fixed |
| 2 | LOW | Fixed |
| 3 | LOW | Fixed |

**Checked**: 3 / **Skipped**: 0 / **Unverified**: 0
