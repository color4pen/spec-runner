/**
 * Idempotency checks for finish command.
 *
 * TC-126: state.status=archived → "Already archived" no-op
 */
import type { JobState } from "../../state/schema.js";

/**
 * Check if the job is fully finished (idempotent re-run guard).
 * TC-126: state.status=archived → no-op
 */
export function isFullyFinished(state: JobState): boolean {
  return state.status === "archived";
}
