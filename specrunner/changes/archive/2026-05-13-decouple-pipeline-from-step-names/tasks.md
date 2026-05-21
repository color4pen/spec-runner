# Tasks: decouple-pipeline-from-step-names

Ordered by dependency: types first, then step definitions, then consumers.

---

## T1 — Add `phase` and `needsProjectContext` to `AgentStep` interface

**File**: `src/core/step/types.ts`

After the `setsBranch` field (line ~138) and before `enrichContext`, insert two new optional fields:

```typescript
/**
 * Pipeline phase this step belongs to.
 * Used by resolve-step.ts to determine resume phase without hardcoding step names.
 * Omit (or set "impl") for implementation-phase steps.
 * Core layer only — do not add managed-runtime concerns here.
 */
phase?: "spec" | "impl";

/**
 * If true, StepExecutor reads project.md from the working directory and
 * injects it as projectContext into AgentRunContext before calling runner.run().
 * Replaces the PROJECT_CONTEXT_STEPS Set in executor.ts.
 */
needsProjectContext?: boolean;
```

---

## T2 — Set flags on spec-phase step definitions

### T2a — `src/core/step/design.ts`

Add `phase: "spec"` and `needsProjectContext: true` to the `DesignStep` object literal.
Insert after `setsBranch: true`:

```typescript
phase: "spec",
needsProjectContext: true,
```

### T2b — `src/core/step/spec-review.ts`

Add `phase: "spec"` and `needsProjectContext: true` to `SpecReviewStep`.

### T2c — `src/core/step/spec-fixer.ts`

Add `phase: "spec"` to `SpecFixerStep`. (`needsProjectContext` is not set on spec-fixer.)

---

## T3 — Set `needsProjectContext` on impl-phase steps that need project context

### T3a — `src/core/step/implementer.ts`

Add `needsProjectContext: true` to `ImplementerStep`.

### T3b — `src/core/step/code-review.ts`

Add `needsProjectContext: true` to `CodeReviewStep`.

---

## T4 — Remove dead branch from `pipeline.ts:getStepOutcome()`

**File**: `src/core/pipeline/pipeline.ts` (around line 350)

Remove the unreachable legacy fallback block. The `completionVerdict` check above it already
handles DesignStep correctly.

**Delete these lines:**
```typescript
    // Legacy default: design → "success", others → "approved"
    if (stepName === STEP_NAMES.DESIGN) {
      return "success";
    }
```

The method should end with just:
```typescript
    return "approved";
```

After this change, verify `STEP_NAMES` is still referenced elsewhere in `pipeline.ts`
before removing its import. (It is likely used in other parts of the file — do not remove it blindly.)

---

## T5 — Replace `PROJECT_CONTEXT_STEPS` in `executor.ts`

**File**: `src/core/step/executor.ts`

1. Delete the constant declaration (lines 22-24):
   ```typescript
   const PROJECT_CONTEXT_STEPS: ReadonlySet<string> = new Set([
     STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.IMPLEMENTER, STEP_NAMES.CODE_REVIEW,
   ]);
   ```

2. Find the usage:
   ```typescript
   if (PROJECT_CONTEXT_STEPS.has(step.name)) {
   ```
   Replace with:
   ```typescript
   if (step.needsProjectContext === true) {
   ```

3. Check whether `STEP_NAMES` is used anywhere else in `executor.ts`.
   If the only usage was `PROJECT_CONTEXT_STEPS`, remove the `import { STEP_NAMES }` line too.

---

## T6 — Replace `SPEC_PHASE_STEPS` / `CODE_PHASE_STEPS` in `resolve-step.ts`

**File**: `src/core/resume/resolve-step.ts`

1. Remove the two Set constants (lines 12-24):
   ```typescript
   const SPEC_PHASE_STEPS = new Set<StepName>([...]);
   const CODE_PHASE_STEPS = new Set<StepName>([...]);
   ```

2. Add imports for all AgentStep singletons at the top of the file (after existing imports):
   ```typescript
   import { DesignStep }     from "../step/design.js";
   import { SpecReviewStep } from "../step/spec-review.js";
   import { SpecFixerStep }  from "../step/spec-fixer.js";
   import { TestCaseGenStep } from "../step/test-case-gen.js";
   import { ImplementerStep } from "../step/implementer.js";
   import { BuildFixerStep }  from "../step/build-fixer.js";
   import { CodeReviewStep }  from "../step/code-review.js";
   import { CodeFixerStep }   from "../step/code-fixer.js";
   ```

3. Replace `isSpecPhase()` with a phase-map implementation:
   ```typescript
   const STEP_PHASE_MAP = new Map<string, "spec" | "impl">(
     [DesignStep, SpecReviewStep, SpecFixerStep,
      TestCaseGenStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]
     .map(s => [s.name, s.phase ?? "impl"]),
   );

   function isSpecPhase(stepName: string): boolean {
     return STEP_PHASE_MAP.get(stepName) === "spec";
   }
   ```

4. The `REVIEWER_STEPS` Set and `STEP_MAPPING` record are **not changed** (out of scope).

---

## T7 — Extract `useSseStrategy()` in `agent-runner.ts`

**File**: `src/adapter/managed-agent/agent-runner.ts`

1. Replace the `run()` body:
   ```typescript
   async run(ctx: AgentRunContext): Promise<AgentRunResult> {
     return this.useSseStrategy(ctx.step)
       ? this.runDesignStyle(ctx)
       : this.runPollingStyle(ctx);
   }
   ```

2. Add the private method immediately after `run()` (before the Design-style section comment):
   ```typescript
   /** True when the step should use SSE streaming rather than polling. */
   private useSseStrategy(step: AgentStep): boolean {
     return step.agent.role === STEP_NAMES.DESIGN;
   }
   ```

   `AgentStep` is already imported via `AgentRunContext`; check if a direct import is needed or if
   it can be inferred from the context type. Add `import type { AgentStep }` from the types file
   if the parameter type requires it.

3. `STEP_NAMES` import stays — it is used by `useSseStrategy`.

---

## T8 — Unify result-not-found error factories

### T8a — `src/errors.ts`

1. Add the generic factory function (place it near the two existing specific functions):

   ```typescript
   /**
    * Generic factory for result-file-not-found errors.
    * Derives the error code from stepName:
    *   "spec-review" → SPEC_REVIEW_RESULT_NOT_FOUND
    *   "code-review" → CODE_REVIEW_RESULT_NOT_FOUND
    *   (any step)    → <STEP_UPPER>_RESULT_NOT_FOUND
    *
    * resultPath is the already-computed path from step.resultFilePath().
    */
   export function resultFileNotFoundError(
     stepName: string,
     resultPath: string,
     branch: string,
   ): SpecRunnerError {
     const code = `${stepName.toUpperCase().replace(/-/g, "_")}_RESULT_NOT_FOUND`;
     return new SpecRunnerError(
       code,
       `Ensure the ${stepName} agent wrote the result file to ${resultPath} on branch '${branch}'. ` +
       `If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors.`,
       `${stepName} result file not found on branch '${branch}'.`,
     );
   }
   ```

2. Delete `specReviewResultNotFoundError()` and `codeReviewResultNotFoundError()`.
   Keep `SPEC_REVIEW_RESULT_NOT_FOUND` and `CODE_REVIEW_RESULT_NOT_FOUND` in `ERROR_CODES`
   (they remain valid codes produced by the generic factory).

3. Remove the `import { specReviewResultPath, reviewFeedbackPath }` line at the top of `errors.ts`
   **only if** neither path utility is referenced anywhere else in the file.
   (These were used exclusively by the two deleted functions.)

### T8b — `src/adapter/managed-agent/agent-runner.ts`

1. Update the import at the top:
   - Remove: `specReviewResultNotFoundError, codeReviewResultNotFoundError`
   - Add: `resultFileNotFoundError`

2. Replace the conditional at the result-file-not-found path (around line 452):

   **Before:**
   ```typescript
   const notFoundErr = step.name === STEP_NAMES.CODE_REVIEW
     ? codeReviewResultNotFoundError(ctx.slug, effectiveBranch, iteration)
     : specReviewResultNotFoundError(ctx.slug, effectiveBranch, iteration);
   ```

   **After:**
   ```typescript
   const notFoundErr = resultFileNotFoundError(step.name, resultFilePath, effectiveBranch);
   ```

   Note: `resultFilePath` is already in scope (computed earlier via `step.resultFilePath(state, stepCtx)`).
   `iteration` is no longer needed at this call site — remove the `const iteration = ...` line
   if it is not referenced elsewhere in the same block.

---

## T9 — Verification

```bash
bun run typecheck
bun run test
```

Both must pass with zero errors. Fix any type errors before marking complete.

### Acceptance checklist

- [x] `pipeline.ts` has no step-name string comparison in `getStepOutcome()`
- [x] `resolve-step.ts` has no `SPEC_PHASE_STEPS` or `CODE_PHASE_STEPS` Set
- [x] `executor.ts` has no `PROJECT_CONTEXT_STEPS`
- [x] `agent-runner.ts:run()` delegates to `useSseStrategy()` — no direct role comparison
- [x] `agent-runner.ts` has no `step.name === STEP_NAMES.CODE_REVIEW` conditional
- [x] `DesignStep`, `SpecReviewStep`, `SpecFixerStep` each declare `phase: "spec"`
- [x] `DesignStep`, `SpecReviewStep`, `ImplementerStep`, `CodeReviewStep` each declare `needsProjectContext: true`
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
