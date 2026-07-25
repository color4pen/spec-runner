# Cross-Boundary Invariants Review — Iteration 1

**Change**: test-materialize-existing-coverage  
**Reviewer**: cross-boundary-invariants  
**Date**: 2026-07-25

---

## Checked Invariants

### 1. `extractMustTcIds` — single point of truth for "must" set

**Status**: ✅ Intact

Both consumers of the must-TC set — `runTestCoveragePhase` (verification step) and
`evaluateTestCoverage` called from `local.ts:1329` (test-materialize output contract) —
reach the manual exclusion exclusively through `extractMustTcIds`. Neither consumer was
modified. The exclusion propagates to both paths without duplication or drift.

Evidence:
- `src/core/verification/test-coverage.ts`: `extractMustTcIds` is called by `evaluateTestCoverage`
  (line 184), which is called by `runTestCoveragePhase` (line 308) and `local.ts:1329`.
- Neither `runner.ts` nor `local.ts` were changed.

---

### 2. `else if` chain — Priority and Category pattern disjointness

**Status**: ✅ Intact

`priorityMustRe = /\*\*Priority\*\*:\s*must/` and `categoryManualRe = /\*\*Category\*\*:\s*manual/`
are structurally disjoint patterns (different keywords). No single line can match both.
The `else if` structure does not suppress one flag when the other fires.

Edge: If both appeared on the same line (e.g., `**Priority**: must **Category**: manual`),
only `currentIsMust` would be set and `currentIsManual` would not — but the TC template
always places these on separate lines. No real impact.

---

### 3. `flushCurrent` — `currentIsManual` reset on TC section boundary

**Status**: ✅ Intact

`flushCurrent()` resets `currentIsManual = false` together with `currentTcId` and
`currentIsMust`. Each TC section starts with a clean slate. Verified in
`extractMustTcIds` lines 118–125.

---

### 4. Template enum line `**Category**: unit | integration | manual` — no false exclusion

**Status**: ✅ Intact

`categoryManualRe = /\*\*Category\*\*:\s*manual/` requires `manual` immediately after
the colon+whitespace. The enum line `**Category**: unit | integration | manual` has `unit`
immediately after the colon, so the regex does not match. Additionally, the enum line
appears in an HTML comment before any `## TC-` section, so `currentTcId` is null and
the branch is not entered regardless.

Confirmed by TC-007 in `test-coverage-manual-exclusion.test.ts`.

---

### 5. Existing tests unchanged — no Category field → `currentIsManual` stays false

**Status**: ✅ Intact

All existing test-coverage fixtures in:
- `test-coverage.test.ts` (TC-001 through TC-027)
- `test-coverage-boundary.test.ts` (TC-TCB-01 through TC-TCB-09)
- `test-coverage-comment-form.test.ts` (TC-004, TC-005)
- `test-materialize-boundary.test.ts` (TC-TMB-09 through TC-TMB-11)

use TCs without `**Category**: manual`. `currentIsManual` remains `false`
throughout. `mustTcIds` output is unchanged. These tests pass with no modification.

---

### 6. `local.ts` output contract gate — manual TC no longer triggers halt

**Status**: ✅ Intact (intended semantic change, no invariant broken)

`local.ts:1330–1332` uses `result.status` and
`[...result.missingTcIds, ...result.assertionlessTcIds]` for the detail.
Since manual TCs are excluded from `mustTcIds`, they never enter either
`missingTcIds` or `assertionlessTcIds`. `result.status === "failed"` is now only
triggered by non-manual must TC deficiencies. No code logic is broken.

---

### 7. `runner.ts` — stdout consumed as display string, not parsed

**Status**: ✅ Intact

`runner.ts:512–527` stores `result.stdout` into `PhaseResult.stdout` for
`verification-result.md`. No code parses this string for decision-making.
The denominator change ("N/M must TCs" where M excludes manual) is a display change only.

---

### 8. `docs/guarantees.md` — no explicit "all must TCs have coverage" guarantee

**Status**: ✅ No invariant exists to break

G1-1 through G1-6 in `docs/guarantees.md` cover: verdict machine-derivation,
finding ref verification, gate skip-inability, loop budget, credential seam,
and conformance gate. None state "all must TCs must have test file coverage".
The manual exclusion narrows what "covered" means but does not bypass any
documented guarantee. No version bump is required by the docs/guarantees.md
own update rules.

---

### 9. Prompt 5-section skeleton — `## Method` addition does not introduce h2

**Status**: ✅ Intact

The new manual TC text was inserted inside `## Method` (lines 73–78 of
`test-materialize-system.ts`) without adding a new `##` heading. Both
`test-materialize-prompt-contract.test.ts` TC-003 (existing) and
`test-materialize-manual-scope-contract.test.ts` (new) verify this.

---

### 10. `outputContracts()` in test-materialize.ts — unchanged

**Status**: ✅ Intact

`test-materialize.ts:87–96` still declares `{ kind: "test-coverage", policy: "halt" }`.
The gate semantics change comes from `evaluateTestCoverage` (via `extractMustTcIds`),
not from the contract declaration. No structural change to the output contract.

---

## Observations (non-blocking)

### OBS-1: Stdout message "no must TCs defined" when all must TCs are manual

**Severity**: low  
**File**: `src/core/verification/test-coverage.ts`  
**Line**: 193

When all must TCs in test-cases.md are `**Category**: manual`, `extractMustTcIds` returns
`[]`, and `evaluateTestCoverage` returns early with:
```
stdout: "test-coverage: 0/0 must TCs covered (no must TCs defined)"
```

The message "no must TCs defined" is technically correct from the coverage gate's
perspective (no TCs require coverage), but could mislead operators into thinking
test-cases.md defines no must TCs when in fact it defines manual must TCs.

This is a display/observability issue — no code decision depends on this string.
No test currently asserts this exact message for the all-manual case.
A future cosmetic improvement (e.g., "no automatable must TCs") could clarify,
but it is not a broken invariant.

---

## Evidence Summary

| Item | Result |
|------|--------|
| `extractMustTcIds` single-point propagation | ✅ verified |
| `else if` pattern disjointness | ✅ verified |
| `flushCurrent` per-section reset | ✅ verified |
| Template enum line non-match | ✅ verified |
| Existing test fixtures unaffected | ✅ verified (5 test files) |
| `local.ts` output gate semantics | ✅ intended change, no bug |
| `runner.ts` stdout non-parsing | ✅ verified |
| `docs/guarantees.md` no broken guarantee | ✅ verified |
| Prompt 5-section skeleton | ✅ verified |
| `outputContracts()` unchanged | ✅ verified |
