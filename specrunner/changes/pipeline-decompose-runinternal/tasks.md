# Tasks: pipeline-decompose-runinternal

## T-01: Create `ConvergenceBudget` module

Create `src/core/pipeline/convergence-budget.ts`.

- [ ] Declare a `ConvergenceBudgetState` interface (or private shape) with fields: `loopIterations: ReadonlyMap<string, number>`, `fixerIterations: ReadonlyMap<string, number>`, `previousLoopStep: string`
- [ ] Implement `ConvergenceBudget` class with a private constructor taking the state
- [ ] Implement `static initial(): ConvergenceBudget` — returns instance with empty Maps and `previousLoopStep: ""`
- [ ] Implement `getLoopIter(stepName: string): number` — returns `loopIterations.get(stepName) ?? 0`
- [ ] Implement `getFixerIter(fixerName: string): number` — returns `fixerIterations.get(fixerName) ?? 0`
- [ ] Implement `getPreviousLoopStep(): string` — returns `previousLoopStep`
- [ ] Implement `enterLoopStep(stepName: string): { budget: ConvergenceBudget; iteration: number }` — constructs new Map with counter incremented, returns new instance + new iteration number
- [ ] Implement `enterFixerStep(fixerName: string): ConvergenceBudget` — constructs new Map with fixer counter incremented, returns new instance
- [ ] Implement `resetLoopStep(stepName: string): ConvergenceBudget` — constructs new Map with `stepName → 0`, returns new instance
- [ ] Implement `resetFixerStep(fixerName: string): ConvergenceBudget` — constructs new Map with `fixerName → 0`, returns new instance
- [ ] Implement `withPreviousLoopStep(step: string): ConvergenceBudget` — returns new instance with updated `previousLoopStep`
- [ ] Export `ConvergenceBudget` class from the file (named export)

**Acceptance Criteria**:
- `ConvergenceBudget.initial().getLoopIter("any") === 0`
- `ConvergenceBudget.initial().getFixerIter("any") === 0`
- `ConvergenceBudget.initial().getPreviousLoopStep() === ""`
- Calling `enterLoopStep("x")` twice on the same budget returns `{ iteration: 2 }` on the second call and leaves the original at iteration 1
- All methods return new instances (no mutation of the original)
- File compiles without type errors (`bun run typecheck`)

---

## T-02: Create `ParallelReviewRound` module

Create `src/core/pipeline/parallel-review-round.ts`.

- [ ] Move the `mergeParallelReviewerStates` function from `pipeline.ts` to this file as a non-exported module-level function (remove `export` keyword; keep the full implementation and JSDoc intact)
- [ ] Declare `ParallelReviewRound` class with private fields `executor: StepExecutor`, `steps: Map<string, Step>`, `parallelReview: ParallelReviewConfig`
- [ ] Implement constructor accepting `{ executor, steps, parallelReview }`
- [ ] Implement `async run(coordinatorName: string, state: JobState, deps: PipelineDeps): Promise<{ outcome: "approved" | "needs-fix" | "escalation"; state: JobState }>` — move the full body of `Pipeline.runCoordinatorFanOut` here; replace the `setState` callback with returning `{ outcome: aggregateVerdictResult, state }` at the end
- [ ] Add required imports to the file: `StepExecutor` from executor, `Step` from types, `ParallelReviewConfig`, `JobState`, `PipelineDeps`, and the reviewer-status helpers currently imported in `pipeline.ts` for this logic
- [ ] Export `ParallelReviewRound` class from the file (named export)

**Acceptance Criteria**:
- `mergeParallelReviewerStates` is NOT exported from `parallel-review-round.ts`
- `ParallelReviewRound` is exported from `parallel-review-round.ts`
- All 9 numbered steps from the `runCoordinatorFanOut` JSDoc comment are preserved in `run()`
- File compiles without type errors
- The behavior tested in `tests/custom-reviewers-e2e.test.ts` is unchanged (all coordinator tests pass)

---

## T-03: Refactor `Pipeline` to use `ConvergenceBudget` and `ParallelReviewRound`

Edit `src/core/pipeline/pipeline.ts`.

- [ ] Add imports: `import { ConvergenceBudget } from "./convergence-budget.js"` and `import { ParallelReviewRound } from "./parallel-review-round.js"`
- [ ] Add `private readonly round: ParallelReviewRound | undefined` field to the `Pipeline` class
- [ ] In the constructor, after existing initialization, add: `this.round = params.parallelReview ? new ParallelReviewRound({ executor: this.executor, steps: this.steps, parallelReview: params.parallelReview }) : undefined`
- [ ] In `runInternal`: replace `const loopIters = new Map<string, number>()`, `const fixerIters = new Map<string, number>()`, and `let prevLoopStep = ""` with `let budget = ConvergenceBudget.initial()`
- [ ] Replace the loop-step-entry bookkeeping block (currently uses `loopIters.set(currentStep, newIter)` and local `loopIter` / `newIter`) with `const { budget: nextBudget, iteration: loopIter } = budget.enterLoopStep(currentStep); budget = nextBudget;`
- [ ] Replace the fixer-step-entry bookkeeping block (`fixerIters.set(currentStep, prevFixerIter + 1)`) with `budget = budget.enterFixerStep(currentStep)`
- [ ] Replace coordinator fan-out call `await this.runCoordinatorFanOut(currentStep, state, deps, (s) => { state = s; })` with `const fanResult = await this.round!.run(currentStep, state, deps); state = fanResult.state; outcome = fanResult.outcome;`
- [ ] Replace the three exhaustion-check calls' iter lookups: `loopIters.get(currentStep) ?? 0` → `budget.getLoopIter(currentStep)`, `loopIters.get(nextStep as string) ?? 0` → `budget.getLoopIter(nextStep as string)`, `fixerIters.get(nextStep as string) ?? 0` → `budget.getFixerIter(nextStep as string)`
- [ ] Replace the fresh-convergence episode-reset block (`loopIters.set(nextStep, 0)` and `fixerIters.set(pairedFixerForNext, 0)`) with `budget = budget.resetLoopStep(nextStep as string).resetFixerStep(pairedFixerForNext)`
- [ ] Replace the unpaired-step episode-reset block (`fixerIters.set(nextStep, 0)` and `loopIters.set(pairedReview, 0)`) with `budget = budget.resetFixerStep(nextStep as string).resetLoopStep(pairedReview)`
- [ ] Replace `const loopIter = loopIters.get(currentStep) ?? 0` (the line after coordinator/regular dispatch, line 364) with `const loopIter = budget.getLoopIter(currentStep)`
- [ ] Replace `prevLoopStep = isLoopStep ? currentStep : ""` with `budget = budget.withPreviousLoopStep(isLoopStep ? currentStep : "")`
- [ ] Replace the history-message expression `prevLoopStep` usage with `budget.getPreviousLoopStep()`
- [ ] Delete the `private async runCoordinatorFanOut(...)` method entirely (moved to `ParallelReviewRound`)
- [ ] Remove the `export function mergeParallelReviewerStates(...)` declaration from `pipeline.ts` (moved to `parallel-review-round.ts`)
- [ ] Remove imports from `pipeline.ts` that were only used by `runCoordinatorFanOut` / `mergeParallelReviewerStates` and are now unused: `deriveReviewerStatuses`, `selectPendingMembers`, `applyRoundResults`, `aggregateVerdict`, `computeInvalidations` (these move to `parallel-review-round.ts`; remove from `pipeline.ts` only after confirming no remaining usage)

**Acceptance Criteria**:
- `Pipeline.runInternal` contains no `Map<string, number>` local variables for iter tracking
- `Pipeline.runInternal` contains no `let prevLoopStep` local variable
- `Pipeline.runCoordinatorFanOut` private method is absent from the class
- `mergeParallelReviewerStates` is not declared in `pipeline.ts`
- `this.round` is initialized in the constructor
- File compiles without type errors

---

## T-04: Verify full test suite and type-check pass

- [ ] Run `bun run typecheck` — must exit 0 with no errors
- [ ] Run `bun run test` — all tests must pass; do NOT modify any test expectation to make them pass
- [ ] If any test imports `mergeParallelReviewerStates` from `pipeline.ts` directly (check at this point), update only the import path to `parallel-review-round.ts`; do not change any assertion

**Acceptance Criteria**:
- `bun run typecheck` exits 0
- `bun run test` exits 0 with all tests passing
- No test file has its assertion logic changed (only import paths may be updated)
