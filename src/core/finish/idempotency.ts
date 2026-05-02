/**
 * Idempotency checks for finish command.
 *
 * TC-047: status=archived + merged dir exists → "Already finished, nothing to do."
 * TC-046: feature MERGED + archive not done → skip merge, continue from archive
 * TC-057: archive PR already MERGED → skip archive
 */
import type { JobState } from "../../state/schema.js";

/**
 * Check if the job is fully finished (idempotent re-run guard).
 * TC-047: status=archived → no-op
 */
export function isFullyFinished(state: JobState): boolean {
  return state.status === "archived";
}
