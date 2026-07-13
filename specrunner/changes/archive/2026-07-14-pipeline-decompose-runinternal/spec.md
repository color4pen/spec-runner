# Spec: pipeline-decompose-runinternal

## Requirements

### Requirement: ConvergenceBudget is an immutable value object

`ConvergenceBudget` SHALL be a class exported from `src/core/pipeline/convergence-budget.ts`. Every method that changes budget state MUST return a new `ConvergenceBudget` instance. The original instance MUST be unmodified after any operation.

#### Scenario: enterLoopStep returns a new instance

**Given** a `ConvergenceBudget` instance with `loopIterations["spec-review"] = 2`
**When** `enterLoopStep("spec-review")` is called
**Then** the returned budget has `getLoopIter("spec-review") === 3` and the original budget still has `getLoopIter("spec-review") === 2`

#### Scenario: initial returns zero-valued budget

**Given** `ConvergenceBudget.initial()` is called
**When** `getLoopIter("any-step")` or `getFixerIter("any-step")` is called on the result
**Then** both return `0`

---

### Requirement: ConvergenceBudget exposes typed atomic operations

`ConvergenceBudget` MUST expose the following operations:

- `static initial(): ConvergenceBudget` — returns a zero-initialized budget
- `enterLoopStep(stepName: string): { budget: ConvergenceBudget; iteration: number }` — increments the loop counter for `stepName` and returns the new budget alongside the new iteration number
- `enterFixerStep(fixerName: string): ConvergenceBudget` — increments the fixer counter for `fixerName`
- `resetLoopStep(stepName: string): ConvergenceBudget` — sets the loop counter for `stepName` to `0`
- `resetFixerStep(fixerName: string): ConvergenceBudget` — sets the fixer counter for `fixerName` to `0`
- `withPreviousLoopStep(step: string): ConvergenceBudget` — records the most recent primary loop step name (or `""` to clear)
- `getLoopIter(stepName: string): number` — returns the current loop counter (0 for unknown step)
- `getFixerIter(fixerName: string): number` — returns the current fixer counter (0 for unknown step)
- `getPreviousLoopStep(): string` — returns the recorded previous loop step name

#### Scenario: unknown step returns 0

**Given** `ConvergenceBudget.initial()`
**When** `getLoopIter("nonexistent")` is called
**Then** the result is `0` (not `undefined`)

---

### Requirement: ParallelReviewRound encapsulates coordinator fan-out

`ParallelReviewRound` SHALL be a class exported from `src/core/pipeline/parallel-review-round.ts`. It MUST expose a `run(coordinatorName, state, deps)` method that returns `Promise<{ outcome: "approved" | "needs-fix" | "escalation"; state: JobState }>`. The logic MUST be identical to the current `Pipeline.runCoordinatorFanOut` implementation, including all 9 numbered steps in the existing JSDoc comment.

#### Scenario: all members approved returns approved outcome

**Given** a `ParallelReviewRound` with two members both in approved status
**When** `run("custom-reviewers", state, deps)` is called
**Then** the returned outcome is `"approved"` and no member steps are executed

#### Scenario: one member needs-fix returns needs-fix outcome

**Given** a `ParallelReviewRound` with one member returning `"needs-fix"` verdict
**When** `run("custom-reviewers", state, deps)` is called
**Then** the returned outcome is `"needs-fix"`

---

### Requirement: Pipeline.runInternal drives budget via ConvergenceBudget

`Pipeline.runInternal` MUST NOT declare `loopIters`, `fixerIters`, or `prevLoopStep` as local `Map`/string variables. All budget tracking MUST be delegated to a `ConvergenceBudget` instance initialized with `ConvergenceBudget.initial()`.

The replacement mapping SHALL be:
- `loopIters.get(step) ?? 0` → `budget.getLoopIter(step)`
- `fixerIters.get(step) ?? 0` → `budget.getFixerIter(step)`
- `loopIters.set(step, n)` → `budget = budget.enterLoopStep(step)` (or `resetLoopStep`)
- `fixerIters.set(step, n)` → `budget = budget.enterFixerStep(step)` (or `resetFixerStep`)
- `prevLoopStep = ...` → `budget = budget.withPreviousLoopStep(...)`

#### Scenario: loop iteration counter increments correctly

**Given** a pipeline with a spec-review loop
**When** spec-review is entered for the third time
**Then** the iteration counter passed to `tryExhaust` is `3`

---

### Requirement: Pipeline.runInternal delegates coordinator execution to ParallelReviewRound

When `isCoordinator` is true, `Pipeline.runInternal` MUST call `this.round!.run(currentStep, state, deps)` and update `state` and `outcome` from the returned value. The `setState` callback pattern MUST NOT appear in the refactored code.

#### Scenario: coordinator outcome updates outer state

**Given** `Pipeline` constructed with a `parallelReview` config
**When** the pipeline reaches the coordinator step
**Then** `state` in `runInternal` is updated to the state returned by `ParallelReviewRound.run()` before the transition table is consulted

---

### Requirement: mergeParallelReviewerStates is co-located with ParallelReviewRound

The `mergeParallelReviewerStates` function MUST be declared in `src/core/pipeline/parallel-review-round.ts`. It MUST NOT be exported from `pipeline.ts`. It MAY be exported from `parallel-review-round.ts` or kept module-internal.

#### Scenario: no external import breakage

**Given** no file outside `src/core/pipeline/pipeline.ts` currently imports `mergeParallelReviewerStates`
**When** the function is moved to `parallel-review-round.ts` as non-exported
**Then** no TypeScript compilation error occurs

---

### Requirement: Pipeline constructor initializes ParallelReviewRound

When `parallelReview` is present in the constructor params, `Pipeline` MUST construct a `ParallelReviewRound` instance stored as `private readonly round`. When absent, `this.round` MUST be `undefined`.

#### Scenario: round is undefined for zero-reviewer pipeline

**Given** `Pipeline` constructed without `parallelReview`
**When** the pipeline runs
**Then** `this.round` is `undefined` and all standard step execution paths are taken

---

### Requirement: All existing tests pass without behavioral modification

The refactor MUST NOT change the observable behavior of the pipeline as exercised by the existing test suite. The following are the only permitted modifications to test files:

- Updating import paths if a symbol moves to a new module
- Updating mock paths if a file is renamed

Test expectations (assertions on state, history, verdicts, event emissions, stdout) MUST NOT be modified.

#### Scenario: episode-reset tests remain green

**Given** the test suite at `tests/unit/core/pipeline/pipeline.episode-reset.test.ts`
**When** the refactored pipeline runs the same inputs
**Then** all assertions in those tests pass without modification to the expectations

#### Scenario: typecheck passes

**Given** the refactored source files
**When** `bun run typecheck` is executed
**Then** exit code is `0` with no type errors
