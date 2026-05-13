# Design: decouple-pipeline-from-step-names

## Problem

The pipeline framework contains 5 locations that inspect step names at runtime to select behavior.
Adding, removing, or renaming a step requires touching the framework — breaking step independence.

| # | File | Current pattern | Smell |
|---|------|-----------------|-------|
| 1 | `pipeline.ts:351` | `if (stepName === STEP_NAMES.DESIGN)` | Dead code — `completionVerdict` already declared on DesignStep |
| 2 | `resolve-step.ts:12` | `SPEC_PHASE_STEPS` hardcoded Set | Phase membership hardcoded outside step definition |
| 3 | `executor.ts:22` | `PROJECT_CONTEXT_STEPS` hardcoded Set | Injection targets hardcoded outside step definition |
| 4 | `agent-runner.ts:98` | `step.agent.role === STEP_NAMES.DESIGN` in `run()` | SSE/polling selection leaks into the top-level dispatcher |
| 5 | `agent-runner.ts:452` | `step.name === STEP_NAMES.CODE_REVIEW` | Error factory selected by step name in a generic fetch stage |

---

## Change 1 — Remove dead branch in `pipeline.ts:getStepOutcome()`

`DesignStep.completionVerdict` is already `"success"`. `getStepOutcome()` checks
`step.completionVerdict` at lines 344-348 **before** the legacy fallback at line 351.
The `if (stepName === STEP_NAMES.DESIGN)` branch is unreachable; remove it.

**Before (lines 344-356):**
```typescript
const step = this.steps.get(stepName);
if (step && step.kind === "agent" && step.completionVerdict !== undefined) {
  return step.completionVerdict;
}
// Legacy default: design → "success", others → "approved"
if (stepName === STEP_NAMES.DESIGN) {
  return "success";
}
return "approved";
```

**After:**
```typescript
const step = this.steps.get(stepName);
if (step && step.kind === "agent" && step.completionVerdict !== undefined) {
  return step.completionVerdict;
}
return "approved";
```

No step definition changes required — this is purely a dead-code removal.

---

## Change 2 — `phase` flag + `resolve-step.ts`

### Interface addition (`types.ts`)

```typescript
/**
 * Pipeline phase this step belongs to.
 * Used by resolve-step.ts to determine resume phase without hardcoding step names.
 * Omit (or set "impl") for implementation-phase steps.
 */
phase?: "spec" | "impl";
```

### Step definitions

Set `phase: "spec"` on: `DesignStep`, `SpecReviewStep`, `SpecFixerStep`.
All other AgentSteps leave `phase` unset (treated as `"impl"` by the lookup).

### `resolve-step.ts` refactor

Steps are singletons (`export const DesignStep: AgentStep = { ... }`), so we can import
them directly and build a name → phase map at module load time.

```typescript
// resolve-step.ts
import { DesignStep }    from "../step/design.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep }  from "../step/spec-fixer.js";
import { TestCaseGenStep } from "../step/test-case-gen.js";
import { ImplementerStep } from "../step/implementer.js";
import { BuildFixerStep }  from "../step/build-fixer.js";
import { CodeReviewStep }  from "../step/code-review.js";
import { CodeFixerStep }   from "../step/code-fixer.js";

const STEP_PHASE_MAP = new Map<string, "spec" | "impl">(
  [DesignStep, SpecReviewStep, SpecFixerStep,
   TestCaseGenStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]
  .map(s => [s.name, s.phase ?? "impl"]),
);

function isSpecPhase(stepName: string): boolean {
  return STEP_PHASE_MAP.get(stepName) === "spec";
}
```

Remove `SPEC_PHASE_STEPS` and `CODE_PHASE_STEPS` (the latter was never used in logic).

**Import concerns**: Steps are object literals with no side effects at import time.
No circular dependency: step definitions (`src/core/step/`) do not import from `src/core/resume/`.
CliSteps (`VerificationStep`, `PrCreateStep`) are excluded — they don't have `phase`, and
`isSpecPhase()` correctly returns `false` for them via the map miss → `"impl"` default.

---

## Change 3 — `needsProjectContext` flag + `executor.ts`

### Interface addition (`types.ts`)

```typescript
/**
 * If true, StepExecutor reads project.md from the working directory and
 * injects it as projectContext into AgentRunContext before calling runner.run().
 * Replaces the PROJECT_CONTEXT_STEPS Set in executor.ts.
 */
needsProjectContext?: boolean;
```

### Step definitions

Set `needsProjectContext: true` on: `DesignStep`, `SpecReviewStep`, `ImplementerStep`, `CodeReviewStep`.

### `executor.ts` refactor

Remove:
```typescript
const PROJECT_CONTEXT_STEPS: ReadonlySet<string> = new Set([
  STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.IMPLEMENTER, STEP_NAMES.CODE_REVIEW,
]);
```

Replace:
```typescript
if (PROJECT_CONTEXT_STEPS.has(step.name)) {
```
With:
```typescript
if (step.needsProjectContext === true) {
```

Also remove the `import { STEP_NAMES }` line from executor.ts if it is no longer referenced
elsewhere in the file (check before removing).

---

## Change 4 — Extract `useSseStrategy()` in `agent-runner.ts`

The SSE vs. polling decision is an adapter-internal implementation detail.
Extract it to a named private method to isolate the rule without touching the core interface.

**Before (`run()`):**
```typescript
async run(ctx: AgentRunContext): Promise<AgentRunResult> {
  const step = ctx.step;
  if (step.agent.role === STEP_NAMES.DESIGN) {
    return this.runDesignStyle(ctx);
  }
  return this.runPollingStyle(ctx);
}
```

**After:**
```typescript
async run(ctx: AgentRunContext): Promise<AgentRunResult> {
  return this.useSseStrategy(ctx.step)
    ? this.runDesignStyle(ctx)
    : this.runPollingStyle(ctx);
}

/** True when the step should use SSE streaming rather than polling. */
private useSseStrategy(step: AgentStep): boolean {
  return step.agent.role === STEP_NAMES.DESIGN;
}
```

**No core interface change**: the rule lives in the adapter. `AgentStep` does not gain a flag.
`STEP_NAMES` import remains in `agent-runner.ts` (used by `useSseStrategy`).

---

## Change 5 — Unify result-not-found error factories in `errors.ts`

`agent-runner.ts` currently selects between two error factories based on step name.
The factories differ only in which path utility they call, but `resultFilePath` is
already computed by `step.resultFilePath()` before the fetch. Pass it directly.

### New generic factory

```typescript
/**
 * Generic factory for result-file-not-found errors.
 * Derives the error code from stepName:
 *   "spec-review" → SPEC_REVIEW_RESULT_NOT_FOUND
 *   "code-review" → CODE_REVIEW_RESULT_NOT_FOUND
 *   (any step)    → <STEP_UPPER>_RESULT_NOT_FOUND
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

The derived code matches the existing `SPEC_REVIEW_RESULT_NOT_FOUND` / `CODE_REVIEW_RESULT_NOT_FOUND`
constants — backward-compatible with any error-code comparisons.

### Remove `specReviewResultNotFoundError` and `codeReviewResultNotFoundError`

Both factory functions are removed. The `ERROR_CODES` entries
(`SPEC_REVIEW_RESULT_NOT_FOUND`, `CODE_REVIEW_RESULT_NOT_FOUND`) are kept — they remain valid
codes produced by the generic factory and may be matched by callers.

### `agent-runner.ts:452` refactor

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

`resultFilePath` is already in scope (computed lines above via `step.resultFilePath(state, stepCtx)`).
`iteration` is no longer needed here (was only used to compute the path).

---

## Affected Files

| File | Change |
|------|--------|
| `src/core/step/types.ts` | Add `phase` and `needsProjectContext` fields to `AgentStep` |
| `src/core/step/design.ts` | Add `phase: "spec"`, `needsProjectContext: true` |
| `src/core/step/spec-review.ts` | Add `phase: "spec"`, `needsProjectContext: true` |
| `src/core/step/spec-fixer.ts` | Add `phase: "spec"` |
| `src/core/step/implementer.ts` | Add `needsProjectContext: true` |
| `src/core/step/code-review.ts` | Add `needsProjectContext: true` |
| `src/core/pipeline/pipeline.ts` | Remove dead `if (stepName === STEP_NAMES.DESIGN)` branch |
| `src/core/resume/resolve-step.ts` | Replace `SPEC_PHASE_STEPS`/`CODE_PHASE_STEPS` with phase-map lookup |
| `src/core/step/executor.ts` | Remove `PROJECT_CONTEXT_STEPS`; use `step.needsProjectContext` |
| `src/adapter/managed-agent/agent-runner.ts` | Extract `useSseStrategy()`; update error call |
| `src/errors.ts` | Add `resultFileNotFoundError`; remove two step-specific factories |

## Out of Scope

- `REVIEWER_STEPS` in `resolve-step.ts` — step names as values for resume mapping; intrinsic
- `STEP_MAPPING` in `resolve-step.ts` — same; step names as data, not control flow
- `LOOP_ERROR_CODES` in `pipeline.ts` — already data-driven; no step-name comparisons
- `STEP_NAMES` constants — canonical source of truth; kept
