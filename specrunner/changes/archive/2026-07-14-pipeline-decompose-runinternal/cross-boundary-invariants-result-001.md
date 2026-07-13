# Cross-Boundary Invariants Review — pipeline-decompose-runinternal — iter 001

- **verdict**: approved
- **iteration**: 001

## Reviewer purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものではなく、既存機構との相互作用に宿るバグクラスが対象。

---

## Scope

| File | Change type |
|------|-------------|
| `src/core/pipeline/convergence-budget.ts` | New module |
| `src/core/pipeline/parallel-review-round.ts` | New module |
| `src/core/pipeline/pipeline.ts` | Refactored (−256 lines) |

---

## Invariant Examination

### INV-1: Counter semantics — `loopIters` / `fixerIters` → `ConvergenceBudget`

**What the unchanged code assumes**: `loopIters.get(step)` returns the iteration count *already incremented* for the current entry, because `loopIters.set(step, newIter)` happens before any downstream read.

**How it is maintained**: `enterLoopStep` increments atomically and returns `{ budget: nextBudget, iteration }`. The outer variable `budget = nextBudget` is assigned **before** `appendHistoryEntry` and before downstream reads, so `budget.getLoopIter(currentStep)` always reflects the incremented value. Verified by tracing lines 221–235 of the new `pipeline.ts`.

**Verdict**: ✓ Invariant preserved.

---

### INV-2: Episode reset — dual-Map mutable → chained immutable

**What the unchanged code assumes**: Both `loopIters.set(nextStep, 0)` and `fixerIters.set(pairedFixer, 0)` take effect atomically before the next exhaustion check.

**How it is maintained**:
- Fresh-convergence path: `budget = budget.resetLoopStep(nextStep).resetFixerStep(pairedFixerForNext)` — each call copies both Maps; chaining produces a final state with both zeros.
- Unpaired-step path: `budget = budget.resetFixerStep(nextStep).resetLoopStep(pairedReview)` — order of `fixer` vs `loop` reset does not matter because they operate on different Maps.

The chained immutable copies produce the identical terminal state as the original sequential `Map.set` calls.

**Verdict**: ✓ Invariant preserved.

---

### INV-3: `prevLoopStep` → `getPreviousLoopStep()` in history message

**What the unchanged code assumes**: `prevLoopStep` is `""` initially (falsy), and transitions to `currentStep` iff `isLoopStep`, so the history message `${prevLoopStep} complete → ${nextStep} (iter …)` fires only after completing a primary loop step.

**How it is maintained**: `budget = budget.withPreviousLoopStep(isLoopStep ? currentStep : "")` is a direct structural mirror. `getPreviousLoopStep()` returns `""` initially (falsy) and the same `currentStep` after a loop step completes. The format string and the `loopName` iter-counter arithmetic are unchanged.

**Verdict**: ✓ Invariant preserved.

---

### INV-4: `setState` callback → `{ outcome, state }` return value

**What the unchanged code assumes**: After `runCoordinatorFanOut` returns, the local `state` variable in `runInternal` holds the post-coordinator state (merged member states, synthetic StepRun written, persisted).

**Original pattern**: `setState(state)` at the very end of `runCoordinatorFanOut`, then `return aggregateVerdictResult`.

**New pattern**: `return { outcome: aggregateVerdictResult, state }` at the very end of `ParallelReviewRound.run()`, consumed as:
```ts
const fanResult = await this.round!.run(currentStep, state, deps);
state = fanResult.state;
outcome = fanResult.outcome;
```

The propagation is semantically equivalent; the call site assignment `state = fanResult.state` replaces the callback mutation. Both patterns guarantee that `state` in `runInternal` is updated exactly once, to the same value.

**Verdict**: ✓ Invariant preserved.

---

### INV-5: `this.round!` non-null assertion safety

**What the unchanged code assumes**: `isCoordinator` is only `true` when `this.parallelReview !== undefined`. The `!` non-null assertion on `this.round` is valid iff the two are always co-initialized.

**How it is maintained**: In the constructor:
```ts
this.round = params.parallelReview
  ? new ParallelReviewRound(...)
  : undefined;
```
`this.round` is `undefined` iff `this.parallelReview` is `undefined`. `isCoordinator` is `this.parallelReview !== undefined && currentStep === this.parallelReview.coordinator`, so the `!` path is only reached when `this.round` is not `undefined`.

**Verdict**: ✓ Assertion is safe.

---

### INV-6: `mergeParallelReviewerStates` export removal

**What the unchanged code assumes**: No external caller (outside `pipeline.ts`) imports `mergeParallelReviewerStates`.

**Verification**: Grepped the entire repository for `import.*mergeParallelReviewerStates` and `from.*pipeline.*mergeParallel` across all `.ts` files. Zero matches outside of `parallel-review-round.ts` (where it is now a private module function). `src/core/pipeline/index.ts` does not re-export it.

**Verdict**: ✓ No external callers. Removal is safe.

---

### INV-7: `iterationsExhausted` field in escalation `resumePoint`

**What the unchanged code assumes**: `iterationsExhausted` reflects the loop iteration count at the moment of escalation.

**Original**: `iterationsExhausted: loopIters.get(currentStep) ?? 0`

**New**: `iterationsExhausted: budget.getLoopIter(currentStep)`

`budget.getLoopIter` returns `this.state.loopIterations.get(stepName) ?? 0` — semantically identical.

**Verdict**: ✓ Invariant preserved.

---

### INV-8: Outer `const loopIter` for exhaustion checks and terminal emission

**What the unchanged code assumes**: `const loopIter = loopIters.get(currentStep) ?? 0` (defined after execution) is used for: loop-exit history, terminal `pipeline:iteration:verdict` events, and `pipeline:iteration:exhausted` events via `tryExhaust`. For non-loop steps this is 0; for loop steps this is the post-increment value.

**How it is maintained**: `const loopIter = budget.getLoopIter(currentStep)` is defined at the same position (after execution, before exit bookkeeping). For loop steps, `budget` already contains the incremented count (from `enterLoopStep` called at the top of the iteration). For non-loop steps (including the coordinator), it returns 0. Identical semantics.

**Note**: The inner `const { ..., iteration: loopIter }` inside `if (isAnyLoopStep)` and the outer `const loopIter = budget.getLoopIter(currentStep)` are both valid TypeScript (different block scopes), and both yield the same numeric value for loop steps. The code-review identified this as a low-severity style issue (finding #1, no-fix). It is not a behavioral invariant violation.

**Verdict**: ✓ Invariant preserved.

---

### INV-9: Fixer iteration counter read timing for bypass check

**What the unchanged code assumes**: `fixerIters.get(pairedFixer)` in the exhaustion bypass check reflects any fixer increments applied so far in the current pipeline run.

**Original**: `fixerIters.get(pairedFixer) ?? 0`

**New**: `budget.getFixerIter(pairedFixer)`

`budget` is updated by `budget = budget.enterFixerStep(currentStep)` at fixer-step entry (line 240), before any exhaustion check. So `budget.getFixerIter(pairedFixer)` returns the same running total as the original mutable Map.

**Verdict**: ✓ Invariant preserved.

---

## Summary

All nine invariants examined are preserved. The implementation is a faithful mechanical transformation from mutable local Maps to an immutable value object. No silent behavioral differences were found between the original `runCoordinatorFanOut` / `loopIters` / `fixerIters` / `prevLoopStep` mechanism and the new `ParallelReviewRound` / `ConvergenceBudget` mechanism.

The 6,550-test suite (including TC-070–TC-074 specifically exercising episode-reset edge cases) passed without modification to any assertion logic (confirmed in verification-result.md).

No cross-boundary invariant violations detected.
