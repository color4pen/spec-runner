# Design: pipeline-decompose-runinternal

## Context

`Pipeline.runInternal()` (currently ~300 lines, `src/core/pipeline/pipeline.ts:256-553`) has three distinct responsibilities mixed together:

1. **Convergence budget** — `loopIters` / `fixerIters` Maps (local vars), episode resets (lines 441–485), and exhaustion checks via `tryExhaust` (lines 492–524)
2. **Parallel fan-out** — `runCoordinatorFanOut()` private method (~130 lines, 732–868) that handles member selection, invalidation, `Promise.allSettled`, merge, reviewer status, synthetic coordinator run, and persist
3. **Driving loop** — step dispatch → outcome → transition table → terminal detection

This refactor extracts concepts 1 and 2 into named modules as structural groundwork for the execution-ownership ADR (`architecture/adr/2026-07-13-execution-ownership-model.md`). All ownership, behavior, and observable output remain unchanged.

**Current `mergeParallelReviewerStates`** is exported from `pipeline.ts` but has no external importers (confirmed by grep). It is relocated to `parallel-review-round.ts` as a module-level function internal to that file.

## Goals / Non-Goals

**Goals**:
- Extract `ConvergenceBudget` as a named immutable value object (pure, synchronous, no I/O)
- Extract `ParallelReviewRound` as a named class wrapping the coordinator fan-out logic
- Slim `runInternal` to the driving loop (step → outcome → transition → terminal)
- Pass all existing tests without modifying their expectations

**Non-Goals**:
- Changing resume input distribution
- Removing member persist or member Git commit
- Changing merge order or reviewer status update logic
- Altering the concurrency behavior of which member consumes which resume
- Adding new tests that fix the current concurrency behavior as spec
- Making `ConvergenceBudget` async or I/O-bearing

## Decisions

**D1: `ConvergenceBudget` is a pure immutable value object**

Each method that mutates budget state returns a new `ConvergenceBudget` instance. The underlying Maps are reconstructed on each update (copy-on-write). No shared mutable state.

*Rationale*: Enables before/after comparison, journal replay for resume reconstruction (future R4–R6), and safe concurrent reasoning. Aligns with the architect decision recorded in the request.
*Alternative considered*: Mutable class with setter methods — rejected because it hides mutation sequence, complicates before/after comparison, and contradicts the stated architect decision.

**D2: `ConvergenceBudget` provides fine-grained atomic operations, not a composite `applyTransitionReset`**

API: `enterLoopStep()`, `enterFixerStep()`, `resetLoopStep()`, `resetFixerStep()`, `withPreviousLoopStep()`. Episode-reset decision logic (the `newEpisode` predicate involving `resolveActiveReviewer`) remains in `Pipeline.runInternal`, which retains access to all required deps.

*Rationale*: Keeps `ConvergenceBudget` free of reviewer-domain knowledge (`resolveActiveReviewer`, `loopFixerPairs` semantics). Each method is a single named operation with no hidden branching.
*Alternative considered*: Composite `applyTransitionReset(currentStep, nextStep, state, loopNames, loopFixerPairs)` — rejected because it imports `resolveActiveReviewer` into the budget module, coupling a pure value object to reviewer-chain domain logic.

**D3: `tryExhaust()` and `handleExhausted()` remain in `Pipeline`**

These methods are async (they call `store.persist`) and depend on `Pipeline` instance members (`events`, `steps`, `summaryStep`). `runInternal` supplies them with iter counts from `budget.getLoopIter()` / `budget.getFixerIter()`.

*Rationale*: `ConvergenceBudget` is synchronous and pure. Moving I/O-bearing methods into it would violate D1.
*Alternative considered*: Moving `tryExhaust` into `ConvergenceBudget` — rejected because it requires injecting deps (store, events) into a value object, losing the purity guarantee.

**D4: `ParallelReviewRound` is a class constructed once in `Pipeline`'s constructor**

```
Pipeline.constructor → this.round = parallelReview ? new ParallelReviewRound({executor, steps, parallelReview}) : undefined
Pipeline.runInternal → { outcome, state } = await this.round!.run(coordinatorName, state, deps)
```

`run()` returns `{ outcome, state }` instead of using a `setState` callback. The callback pattern (`(s) => { state = s }`) in `runCoordinatorFanOut` is replaced by the return value.

*Rationale*: Consistent with how `executor` is injected; single instance avoids repeated construction; removing the callback simplifies the call site.
*Alternative considered*: Free function `runParallelReviewRound(steps, executor, ...)` — also viable, but class better encapsulates the fixed deps and mirrors Pipeline's own construction pattern.

**D5: `mergeParallelReviewerStates` moves to `parallel-review-round.ts` as a non-exported module function**

The function is only called within `runCoordinatorFanOut` (now `ParallelReviewRound.run()`). No external callers exist. Removing the export from `pipeline.ts` collocates the helper with its only consumer.

*Rationale*: Reduces `pipeline.ts` surface area; no breakage (zero external importers confirmed).
*Alternative considered*: Keep in `pipeline.ts` as an export — no breakage, but leaves an unused public export in the wrong file.

## Risks / Trade-offs

**[Risk] Episode-reset regression in multi-reviewer / shared-fixer paths**
The episode-reset logic (lines 441–485) is intricate (`newEpisode` detection for shared-fixer forward entries). Moving from local vars to immutable budget ops could introduce an off-by-one if the mutation sequence is wrong.
*Mitigation*: `tests/unit/core/pipeline/pipeline.episode-reset.test.ts` exercises these exact paths. The budget API (`resetLoopStep`, `resetFixerStep`) must be applied in the same order as the current `loopIters.set` / `fixerIters.set` calls.

**[Risk] `setState` callback removal alters state propagation**
`runCoordinatorFanOut` currently calls `setState(state)` at the end. If `ParallelReviewRound.run()` returns the final state via return value and the caller in `runInternal` does `state = result.state`, the propagation is equivalent — but the pattern change is non-trivial.
*Mitigation*: The call site is a single assignment. The returned state is identical to what `setState` received.

## Open Questions

None — all design forks resolved above.
