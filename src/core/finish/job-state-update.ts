/**
 * Job state update step for finish/archive command.
 *
 * TC-029: awaiting-archive → status: "archived" + history entry
 * TC-030: escalation → state unchanged
 * TC-031: status=running → reject (JOB_NOT_FINISHABLE)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { JobStateStore } from "../../store/job-state-store.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { JobState } from "../../state/schema.js";
import { canTransition, transitionJob } from "../../state/lifecycle.js";
import { resolveCanonicalStateDir } from "./resolve-canonical-state-dir.js";

export const STATUS_HINTS: Record<string, string> = {
  running: "Wait for the running job to complete before archiving.",
  "awaiting-resume": "Run 'specrunner job resume' to continue the halted job before archiving.",
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
 * Mark the job as archived by reading, transitioning, and persisting slug canonical state.
 *
 * D1: reads from slug canonical location (active or archive) — never from legacy jobId store.
 * D2: resolveCanonicalStateDir resolves the physical location regardless of mv status.
 * D3: changeDir seam in JobStateStore enables read/write to archive location.
 *
 * Idempotent: if already archived, returns current state without persisting.
 *
 * TC-029: transitions status → "archived" and appends history + events record
 * TC-083: atomic write protocol via JobStateStore → atomicWriteJson
 */
export async function markJobArchived(slug: string, repoRoot: string): Promise<JobState> {
  const dir = await resolveCanonicalStateDir(slug, repoRoot);
  if (!dir) {
    throw new SpecRunnerError(
      ERROR_CODES.JOB_NOT_FOUND,
      `No state found for slug '${slug}'. The change folder may have been deleted.`,
      `markJobArchived: cannot find canonical state dir for slug '${slug}'`,
    );
  }

  // Read jobId from state.json to construct the store
  const rawState = JSON.parse(
    await fs.readFile(path.join(dir, "state.json"), "utf-8"),
  ) as Record<string, unknown>;
  const jobId = rawState["jobId"];
  if (typeof jobId !== "string") {
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      `state.json for slug '${slug}' is missing a valid jobId.`,
      `markJobArchived: state.json at '${dir}' has no string jobId field`,
    );
  }

  // D3: changeDir seam — store reads/writes files in the resolved dir directly
  const store = new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot, changeDir: dir });
  const current = await store.load();
  const { state: updated, noop } = transitionJob(current as JobState, "archived", {
    trigger: "archive",
    reason: "change archived",
  });
  if (noop) return current as JobState; // already archived → no-op (idempotent)
  await store.persist(updated);
  return updated;
}
