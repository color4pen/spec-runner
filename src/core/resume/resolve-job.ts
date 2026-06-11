import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import type { JobState } from "../../state/schema.js";

/**
 * Resolve a job by slug, returning the most recent matching JobState.
 *
 * Unlike resolveBySlug() in finish/resolve-target.ts, this function does NOT
 * require pullRequest or branch to be present. It is used by the resume command
 * which operates on jobs that may be pre-PR (awaiting-resume before pr-create).
 *
 * Returns null if no matching job is found.
 * When multiple jobs match, returns the one with the latest updatedAt.
 *
 * Design D1: resolveBySlug() from finish/resolve-target.ts is NOT used here
 * because it requires PR info via buildResolvedTarget().
 */
export async function resolveJobStateBySlug(slug: string, repoRoot: string): Promise<JobState | null> {
  const allStates = await JobStateStore.list(repoRoot, { includeArchived: true });
  const matching = allStates.filter((s) => getJobSlug(s) === slug);

  if (matching.length === 0) {
    return null;
  }

  if (matching.length === 1) {
    return matching[0]!;
  }

  // Multiple matches: return the most recently updated one
  matching.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return matching[0]!;
}
