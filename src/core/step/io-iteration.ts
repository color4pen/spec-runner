import type { JobState } from "../../state/schema.js";

/**
 * Compute the next iteration number for the given step's own writes.
 * = (past execution count) + 1
 *
 * Matches the inline formula used by getOutputTemplates and computeCodeReviewIteration.
 * Used in each step's writes() declaration to resolve {n} for the current execution.
 *
 * Example: spec-review has run once → nextIteration(state, "spec-review") === 2
 */
export function nextIteration(state: JobState, stepName: string): number {
  return (state.steps?.[stepName]?.length ?? 0) + 1;
}

/**
 * Compute the latest (most recent) iteration number for the given step's outputs.
 * = past execution count (0 if never run)
 *
 * Used by consumer steps (fixers) to derive the path of a producer's most recent output.
 * When the producer has not run yet, returns 0 — the resolved path will not exist,
 * and the pre-execution validator will emit STEP_INPUT_MISSING.
 *
 * Example: code-review has run twice → latestIteration(state, "code-review") === 2
 */
export function latestIteration(state: JobState, stepName: string): number {
  return state.steps?.[stepName]?.length ?? 0;
}
