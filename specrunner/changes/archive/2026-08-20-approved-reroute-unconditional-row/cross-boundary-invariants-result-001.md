# Cross-Boundary Invariants Review: approved-reroute-unconditional-row

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: `src/core/pipeline/pipeline.ts` (T-03 cleanTransition logic) + `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` (TC-017)

---

## Purpose

Detect whether new behaviour silently breaks implicit assumptions of code the diff does **not** touch. Target: interaction defects that survive green tests — not implementation correctness (which is handled by TC-017 and existing TCs).

---

## Scope Summary

The diff changes two files:

| File | Change |
|------|--------|
| `src/core/pipeline/pipeline.ts` | T-03 cleanTransition predicate: replace `!fixerNamesForReroute.has(t.to)` + `(!t.when \|\| t.when(state))` with `t.to !== budgetSkippedFixer` + `t.when === undefined` |
| `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` | Add TC-017: spec-fixer budget exhausted → T-03 reroutes spec-review → implementer |

---

## Invariants Checked

### INV-1: Fixer budget gate (pipeline.ts:590-596) is not bypassed by T-03 re-route

**Concern**: After T-03 sets `nextStep = "implementer"`, the fixer exhaustion check at lines 590-596 fires — because `Object.values(loopFixerPairs).includes("implementer")` = true. If `budget.getFixerIter("implementer") >= effectiveMax` at that point, the pipeline halts with `VERIFICATION_RETRIES_EXHAUSTED` instead of completing.

**Trace (fresh pipeline, TC-017 scenario)**:
- spec-review phase runs entirely before verification; no implementer-as-fixer budget is consumed.
- `budget.getFixerIter("implementer") = 0 < effectiveMax(2)` → gate passes.

**Trace (conformance re-entry scenario)**:
- Pipeline reaches conformance only if verification has *passed*. Verification passing requires that the fixer exhaustion gate at lines 590-596 has not halted the pipeline, which is only possible when `budget.getFixerIter("implementer") < effectiveMax` at the time each verification-fixer entry is attempted.
- Therefore: `budget.getFixerIter("implementer") < maxIterations` is a guaranteed invariant at any state where conformance runs. If conformance → spec-fixer → spec-review → T-03 fires, the subsequent fixer budget check for implementer (budget < maxIterations) passes cleanly.
- The "unpaired step → fixer episode reset" (pipeline.ts:551-557) does NOT reset implementer's budget when conformance → spec-fixer fires (it resets only spec-fixer + spec-review). This is pre-existing behaviour and is safe because the budget is already bounded below maxIterations.

**Verdict**: Invariant preserved. ✓

---

### INV-2: `t.when === undefined` stricter filter does not exclude the intended cleanTransition target

**Concern**: The old filter `(!t.when || t.when(state))` included guarded rows when the guard returned true. The new `t.when === undefined` is strictly tighter. If the intended unconditional approved row for a reviewer is actually guarded (even trivially), T-03 would now fail to find it, and the fall-through would halt.

**Analysis of production transition table** (STANDARD_TRANSITIONS + buildReviewerChainTransitions):

`spec-review` approved rows:
- `to: spec-fixer`, `when: specReviewHasRoutableFixables` → guarded, excluded ✓
- `to: implementer`, `when: undefined` → unconditional, included ✓

`code-review` approved rows (from `buildReviewerChainTransitions`):
- `to: code-fixer`, `when: (has fixable findings)` → guarded, excluded ✓
- `to: conformance` (or next reviewer), `when: undefined` → unconditional, included ✓

`code-review` with custom reviewers (`buildParallelReviewerTransitions`):
- `to: code-fixer`, `when: (has fixable findings)` → guarded, excluded ✓
- `to: coordinator`, `when: undefined` → unconditional, included ✓

All "clean pass-through" approved rows in the production table are unconditional (`when === undefined`). The tightening is correct and safe for all current reviewer configurations.

**Future risk**: If a future transition table author adds a guarded approved row between the observation-auto-fix row and the unconditional row — and that row would *also* be a valid T-03 re-route target — `t.when === undefined` would skip it, which is the intended behaviour (T-03 targets only the unconditional row by design). This is a design property, not a defect.

**Verdict**: Invariant preserved. ✓

---

### INV-3: `currentStep === exhaustedReviewer` guard (pipeline.ts:472) continues to block false-positive T-03 fires

**Concern**: Direct paths to implementer that are NOT fixer re-routes (e.g., spec-review approved → implementer via isTestGenExempt in TC-016, or spec-fixer-observation-forward path) must not be intercepted by T-03.

**Analysis**:
- The guard at line 472 is unchanged: `if (currentStep === exhaustedReviewer && budget.getFixerIter(budgetSkippedFixer) >= effectiveMaxReroute)`.
- When spec-review approved → implementer fires as a *direct* path (not via guarded fixer row), `nextStep = "implementer"` and T-03 fires at line 460-463 (`fixerNamesForReroute.has("implementer")` = true). But `exhaustedReviewer = resolvePairedReviewForFixer(state, "implementer", loopFixerPairs)` = `"verification"`. Since `currentStep = "spec-review" ≠ "verification"`, the guard blocks T-03 at line 472. TC-016 exercises this path and passes.
- The change does NOT touch line 472. Invariant unchanged.

**Verdict**: Invariant preserved. ✓

---

### INV-4: specFixerObservationForward and specFixerNeedsFixForward guards are not invalidated by T-03 outcome

**Concern**: After T-03 reroutes spec-review → implementer (bypassing spec-fixer), the state has: spec-review last verdict = "approved", routable fixable findings remain unprocessed. If spec-fixer later runs (via conformance → spec-fixer), the `specFixerObservationForward` guard checks `getConformanceFixContext(state, spec-fixer) !== null`. In the conformance re-entry case, this returns non-null, so the guard correctly blocks the observation-forward path and routes spec-fixer → spec-review (unconditional). No state corruption.

In the non-conformance case, spec-fixer does not run after T-03 (the pipeline proceeds implementer → verification → ...). So these guards are not consulted.

**Verdict**: Invariant preserved. ✓

---

### INV-5: Episode reset does not fire for T-03 re-route from spec-review → implementer

**Concern**: The "fresh convergence episode reset" at pipeline.ts:526-543 resets loop + fixer budgets when entering a loop step from a non-fixer predecessor. If it unexpectedly reset implementer's budget or verification's loop counter during the T-03 re-route, it could mask an exhausted budget.

**Analysis**:
- `loopNames.includes("implementer")` = false (implementer is a creator, not a loop reviewer). So `pairedFixerForNext = undefined` and the episode reset block is skipped.
- The episode reset correctly fires only when entering a loop step (spec-review, verification, code-review, conformance). T-03 routes to implementer, which is not a loop step. No reset.

**Verdict**: Invariant preserved. ✓

---

### INV-6: Existing TC-001, TC-014, TC-016 behaviour is unaffected

**Concern**: The narrowed cleanTransition filter might accidentally change code-review T-03 or the spec-review isTestGenExempt paths.

**TC-001 (code-review approved + code-fixer budget exhausted → conformance)**:
- `buildReviewerChainTransitions` produces a single unconditional approved row for code-review: `{ to: conformance, when: undefined }`.
- New filter: `t.to !== "code-fixer" && t.to !== "end" && t.to !== "escalate" && t.when === undefined` → finds `{ to: conformance }`. Identical result to old filter.

**TC-014 (destruction confirmation for TC-001)**:
- Tests that removing T-03 causes exhaustion halt. The T-03 block itself is unchanged (only the cleanTransition predicate within it changed). Destruction behaviour is preserved.

**TC-016 (spec-review approved isTestGenExempt → implementer, not blocked by verification budget)**:
- T-03 fires at line 460 (implementer ∈ fixerNamesForReroute). Line 472 guard blocks it (`spec-review ≠ verification`). cleanTransition is never evaluated. Behaviour unchanged by the predicate change.

**Verdict**: Invariant preserved. ✓

---

## Observations (non-blocking)

### OBS-1: Conformance re-entry T-03 scenario not covered by TC-017

TC-017 covers only the fresh-pipeline scenario (no prior verification). The conformance → spec-fixer → spec-review → T-03 → implementer path is not tested. As analysed above (INV-1), this path is safe because reaching conformance implies `budget.getFixerIter("implementer") < maxIterations`. A future test covering this path would add confidence.

### OBS-2: TC-017 slug coupling to change folder

TC-017 uses `TEST_SLUG = "approved-reroute-unconditional-row"` (the slug of this change) so that `specRunner/changes/approved-reroute-unconditional-row/spec.md` falls within the spec-fixer writable canon paths. This correctly exercises `specReviewHasRoutableFixables`. If TC-017 is ever refactored to a different slug, the `SPEC_MD_PATH` constant must also be updated.

---

## Summary

| Invariant | Status |
|-----------|--------|
| INV-1: Fixer budget gate not bypassed | ✓ Preserved |
| INV-2: `t.when === undefined` finds correct target | ✓ Preserved |
| INV-3: `currentStep === exhaustedReviewer` guard untouched | ✓ Preserved |
| INV-4: specFixer observation/needs-fix guards unaffected | ✓ Preserved |
| INV-5: Episode reset not triggered by T-03 reroute | ✓ Preserved |
| INV-6: TC-001, TC-014, TC-016 behaviour unchanged | ✓ Preserved |

**No cross-boundary invariant violations found.** The narrowing from `!fixerNamesForReroute.has(t.to)` to `t.to !== budgetSkippedFixer` is a precise correction: the old exclusion set was semantically incorrect (it encoded "is-a-fixer" globally rather than "is-the-exhausted-fixer"). The new exclusion is minimal and semantically exact. The `t.when === undefined` tightening matches the stated T-03 contract ("unconditional row") and is correct for all current transition configurations.
