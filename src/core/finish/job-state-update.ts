/**
 * Job state update step for finish command.
 *
 * TC-029: awaiting-merge → status: "archived" + history entry
 * TC-030: escalation → state unchanged
 * TC-031: status=running → reject (JOB_NOT_FINISHABLE)
 */
import { JobStateStore } from "../../store/job-state-store.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { JobState } from "../../state/schema.js";
import { canTransition, transitionJob } from "../../state/lifecycle.js";

export const STATUS_HINTS: Record<string, string> = {
  running: "Wait for the running job to complete before finishing.",
  "awaiting-resume": "Run 'specrunner job resume' to continue the halted job before finishing.",
  canceled: "Job is already canceled. No action needed.",
  failed: "Run 'specrunner job cancel <jobId>' to cancel the failed job.",
  terminated: "Run 'specrunner job cancel <jobId>' to cancel the terminated job.",
};

/**
 * Gate: only allow finishing jobs that can transition to archived.
 * Uses canTransition for consistency with lifecycle rules.
 * TC-031: status=running → error
 */
export function assertJobFinishable(state: JobState): void {
  if (canTransition(state.status, "archived")) return;

  const hint =
    STATUS_HINTS[state.status] ?? `Cannot finish job in status '${state.status}'.`;
  throw new SpecRunnerError(
    ERROR_CODES.JOB_NOT_FINISHABLE,
    hint,
    `Cannot finish job ${state.jobId}: status is '${state.status}'.`,
  );
}

/**
 * Mark the job as archived using transitionJob for lifecycle consistency.
 * TC-029: transitions status → "archived" and appends history
 * TC-083: atomic write protocol via JobStateStore → atomicWriteJson
 */
export async function markJobArchived(jobId: string): Promise<JobState> {
  const store = new JobStateStore(jobId);
  const current = await store.load();
  const { state: updated, noop } = transitionJob(current as JobState, "archived", {
    trigger: "finish",
    reason: "PR merged",
  });
  if (noop) return current as JobState; // 既に archived → 変更なし
  await store.persist(updated);
  return updated;
}
