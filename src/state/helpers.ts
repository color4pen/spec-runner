import type { JobState, StepResult, StepRun, ModelUsage } from "./schema.js";

/**
 * Convert a StepRun to StepResult shape (legacy view).
 * Used for backward compatibility when consuming step records.
 */
export function toLegacyStepResult(step: StepRun | StepResult): StepResult {
  // Check if it's already a StepResult (has iteration field)
  if ("iteration" in step) {
    return step as StepResult;
  }

  // Otherwise it's a StepRun, project to StepResult
  const run = step as StepRun;
  return {
    iteration: run.attempt,
    session: run.sessionId
      ? {
          id: run.sessionId,
          agentId: "",
          environmentId: "",
        }
      : null,
    verdict: run.outcome.verdict,
    findingsPath: run.outcome.findingsPath ?? null,
    completedAt: run.endedAt,
    error: run.outcome.error,
    fileContent: run.outcome.fileContent,
  };
}

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
  const lastResult = results[results.length - 1];
  return lastResult ? toLegacyStepResult(lastResult) : undefined;
}

/**
 * Input shape accepted by pushStepResult.
 * Accepts the legacy StepResult shape (without iteration) for backward compat.
 * Internally writes StepRun objects to state.
 */
export interface StepResultInput {
  session?: { id: string; agentId: string; environmentId: string } | null;
  verdict: import("./schema.js").Verdict | null;
  findingsPath: string | null;
  completedAt?: string | null;
  error: import("./schema.js").ErrorInfo | null;
  fileContent?: string | null;
  /**
   * Per-model token usage from the agent run.
   * Only present for ClaudeCodeRunner steps; absent for ManagedAgentRunner and CLI steps.
   */
  modelUsage?: Record<string, ModelUsage>;
}

/**
 * Push a new step result into state.steps for the given step name.
 * Auto-assigns attempt number based on existing array length.
 * Returns a new state object (does not mutate the original).
 *
 * Writes StepRun objects (new schema D8b). Legacy StepResult-shaped input is
 * mapped to StepRun internally so all new state files use the canonical schema.
 */
export function pushStepResult(
  state: JobState,
  stepName: string,
  partial: StepResultInput,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const attempt = existing.length + 1;
  const now = partial.completedAt ?? new Date().toISOString();
  const run: StepRun = {
    attempt,
    sessionId: partial.session?.id ?? null,
    outcome: {
      verdict: partial.verdict,
      findingsPath: partial.findingsPath,
      error: partial.error,
      fileContent: partial.fileContent,
    },
    startedAt: now,
    endedAt: now,
    ...(partial.modelUsage !== undefined ? { modelUsage: partial.modelUsage } : {}),
  };
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepName]: [...existing, run],
    },
    updatedAt: new Date().toISOString(),
  };
}
