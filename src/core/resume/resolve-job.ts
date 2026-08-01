import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import { slugOccupancyAmbiguousError } from "../../errors.js";
import type { JobState } from "../../state/schema.js";

/**
 * Resolve a job by slug using state-based (not time-based) selection.
 *
 * Scans active (non-archived) job states and filters by slug. Classifies by
 * TERMINAL_STATUSES:
 *   - exactly 1 non-terminal → return it
 *   - 0 non-terminal → null (slug is free, no live job to resume)
 *   - ≥2 non-terminal → throw SLUG_OCCUPANCY_AMBIGUOUS (breach)
 *
 * Terminal jobs are not returned (callers use this to find a resume target).
 *
 * Design D5: updatedAt is NOT used for selection — state status is the source of
 * truth. Dead-pid running jobs are NOT auto-promoted: the caller is responsible for
 * stale-running recovery.
 */
export async function resolveJobStateBySlug(slug: string, repoRoot: string): Promise<JobState | null> {
  const allStates = await JobStateStore.list(repoRoot, { includeArchived: false });
  const matching = allStates.filter((s) => getJobSlug(s) === slug);

  if (matching.length === 0) {
    return null;
  }

  // Classify by terminal status
  const nonTerminal = matching.filter((s) => !TERMINAL_STATUSES.has(s.status));
  // terminal = matching but not non-terminal (for completeness, though not used here)

  if (nonTerminal.length === 0) {
    // All matching jobs are terminal → no live job to resume
    return null;
  }

  if (nonTerminal.length === 1) {
    return nonTerminal[0]!;
  }

  // ≥2 non-terminal: invariant breach — throw with enumeration
  const candidates = nonTerminal.map((s) => ({
    jobId: s.jobId,
    status: s.status,
    updatedAt: s.updatedAt,
  }));
  throw slugOccupancyAmbiguousError(slug, candidates);
}
