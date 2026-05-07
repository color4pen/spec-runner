import type { JobState } from "../../state/schema.js";

/**
 * Check whether a step has escalated consecutively N or more times.
 *
 * Scans the tail of state.steps[stepName], up to `threshold` entries.
 * Returns true if all of those entries have verdict "escalation" or "error".
 *
 * Design D4: threshold defaults to 3. --force overrides this check.
 *
 * @param state - current job state
 * @param stepName - the step to inspect
 * @param threshold - number of consecutive escalations required to trigger (default 3)
 */
export function checkConsecutiveEscalations(
  state: JobState,
  stepName: string,
  threshold = 3,
): boolean {
  const runs = state.steps?.[stepName];
  if (!runs || runs.length === 0) {
    return false;
  }

  // Take the last `threshold` entries
  const tail = runs.slice(-threshold);

  // We only block if we actually have `threshold` entries and all are escalation/error
  if (tail.length < threshold) {
    return false;
  }

  return tail.every((run) => {
    const verdict = run.outcome?.verdict;
    return verdict === "escalation" || verdict === "error";
  });
}

/**
 * Check whether the job state is stale (updatedAt older than thresholdMs).
 *
 * Design D6: default threshold is 24 hours (86400000 ms). Warning only — does not block.
 *
 * @param state - current job state
 * @param thresholdMs - age threshold in milliseconds (default 24 hours)
 */
export function checkStaleState(
  state: JobState,
  thresholdMs = 86400000,
): boolean {
  const updatedAt = new Date(state.updatedAt).getTime();
  return Date.now() - updatedAt > thresholdMs;
}
