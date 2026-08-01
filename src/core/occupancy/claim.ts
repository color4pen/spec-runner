/**
 * claimLivenessSidecar: check-and-claim for liveness sidecar writes.
 *
 * Before writing a liveness sidecar, verify that the existing sidecar (if any)
 * does not belong to a different non-terminal job. If it does, refuse the claim
 * to prevent two live jobs from sharing the same slug's sidecar.
 *
 * Cases:
 *   - Absent sidecar → claim (write)
 *   - Sidecar with same jobId → refresh (overwrite)
 *   - Sidecar with terminal/unknown foreign job → claim (overwrite)
 *   - Sidecar with non-terminal foreign job → throw (claim refused)
 *
 * Design D4: fail-closed on foreign non-terminal sidecar; I/O write failures
 * are swallowed by callers (best-effort), but claim refusal propagates.
 */
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import type { JobStatus } from "../../state/schema.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidecarRecord {
  jobId: string;
  worktreePath: string | null;
  pid: number | null;
  session: unknown;
}

export interface ClaimLivenessSidecarDeps {
  /** Read the current sidecar; return null if absent. */
  readSidecar: (repoRoot: string, slug: string) => Promise<{ jobId: string } | null>;
  /** Get the status of a job from state; return null if not found. */
  getJobStatus: (repoRoot: string, slug: string, jobId: string) => Promise<string | null>;
  /** Write the sidecar record (atomically). */
  writeSidecar: (repoRoot: string, slug: string, record: SidecarRecord) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Claim (or refresh) the liveness sidecar for the given job.
 * Throws a SpecRunnerError if the sidecar belongs to a different non-terminal job.
 */
export async function claimLivenessSidecar(
  repoRoot: string,
  slug: string,
  record: SidecarRecord,
  deps: ClaimLivenessSidecarDeps,
): Promise<void> {
  // Read the existing sidecar
  const existing = await deps.readSidecar(repoRoot, slug);

  if (existing === null) {
    // Absent → safe to claim
    await deps.writeSidecar(repoRoot, slug, record);
    return;
  }

  if (existing.jobId === record.jobId) {
    // Same job → refresh (overwrite)
    await deps.writeSidecar(repoRoot, slug, record);
    return;
  }

  // Different job → check if it's terminal
  const foreignStatus = await deps.getJobStatus(repoRoot, slug, existing.jobId);

  if (foreignStatus === null) {
    // Foreign job not found in state → stale sidecar, safe to claim
    await deps.writeSidecar(repoRoot, slug, record);
    return;
  }

  if (TERMINAL_STATUSES.has(foreignStatus as JobStatus)) {
    // Foreign job is terminal → safe to claim
    await deps.writeSidecar(repoRoot, slug, record);
    return;
  }

  // Foreign job is non-terminal → refuse claim
  throw new SpecRunnerError(
    ERROR_CODES.SLUG_OCCUPIED,
    `Cancel or resume the existing job (${existing.jobId}) before starting a new one for slug '${slug}'.`,
    `Liveness sidecar for slug '${slug}' belongs to a different non-terminal job (${existing.jobId}, status: ${foreignStatus}). Cannot overwrite.`,
  );
}
