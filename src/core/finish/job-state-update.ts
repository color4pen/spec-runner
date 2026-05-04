/**
 * Job state update step for finish command.
 *
 * TC-029: awaiting-merge → status: "archived" + history entry
 * TC-030: escalation → state unchanged
 * TC-031: status=running → reject (JOB_NOT_FINISHABLE)
 */
import { updateJobState } from "../../state/store.js";
import { appendHistoryEntry } from "../../state/schema.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { JobState } from "../../state/schema.js";

/**
 * Gate: only allow finishing jobs in awaiting-merge or archived status.
 * TC-031: status=running → error
 */
export function assertJobFinishable(state: JobState): void {
  if (state.status === "archived") {
    // Idempotent: already archived (TC-126)
    return;
  }
  if (state.status === "awaiting-merge") {
    // Happy path: pipeline complete, ready to finish
    return;
  }
  if (state.status === "running") {
    throw new SpecRunnerError(
      ERROR_CODES.JOB_NOT_FINISHABLE,
      "Wait for the running job to complete before finishing.",
      `Cannot finish job ${state.jobId}: status is 'running'. The job is still in progress.`,
    );
  }
  // failed or terminated
  throw new SpecRunnerError(
    ERROR_CODES.JOB_NOT_FINISHABLE,
    "Use 'specrunner cancel' to clean up failed or terminated jobs.",
    `Cannot finish job ${state.jobId}: status is '${state.status}'. Finish is only for successfully completed pipelines.`,
  );
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
