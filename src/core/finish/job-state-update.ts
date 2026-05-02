/**
 * Job state update step for finish command.
 *
 * TC-029: success → status: "archived" + history entry
 * TC-030: escalation → state unchanged
 * TC-031: status=running → reject (JOB_NOT_FINISHABLE)
 */
import { updateJobState } from "../../state/store.js";
import { appendHistoryEntry } from "../../state/schema.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { JobState } from "../../state/schema.js";

/**
 * Gate: reject if job status is "running".
 * TC-031: status=running → error
 */
export function assertJobFinishable(state: JobState): void {
  if (state.status === "running") {
    throw new SpecRunnerError(
      ERROR_CODES.JOB_NOT_FINISHABLE,
      "Wait for the running job to complete before finishing.",
      `Cannot finish job ${state.jobId}: status is 'running'. The job is still in progress.`,
    );
  }
}

/**
 * Mark the job as archived with a finish history entry.
 * TC-029: transitions status → "archived" and appends history
 * TC-083: atomic write protocol via updateJobState → atomicWriteJson
 */
export async function markJobArchived(jobId: string): Promise<JobState> {
  return updateJobState(jobId, (state) => {
    const withHistory = appendHistoryEntry(state, {
      ts: new Date().toISOString(),
      step: "finish",
      status: "ok",
      message: "Job archived via specrunner finish.",
    });
    return {
      ...withHistory,
      status: "archived",
    };
  });
}
