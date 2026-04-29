import type { JobState, StepResult } from "./schema.js";

/**
 * Get the most recent step result for a given step name.
 * Returns undefined if the step has no results.
 */
export function getLatestStepResult(
  state: JobState,
  stepName: string,
): StepResult | undefined {
  const results = state.steps?.[stepName];
  if (!results || results.length === 0) {
    return undefined;
  }
  return results[results.length - 1];
}

/**
 * Push a new step result into state.steps for the given step name.
 * Auto-assigns iteration number based on existing array length.
 * Returns a new state object (does not mutate the original).
 */
export function pushStepResult(
  state: JobState,
  stepName: string,
  partial: Omit<StepResult, "iteration">,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const iteration = existing.length + 1;
  const result: StepResult = {
    iteration,
    ...partial,
  };
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepName]: [...existing, result],
    },
    updatedAt: new Date().toISOString(),
  };
}
