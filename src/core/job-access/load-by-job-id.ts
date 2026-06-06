/**
 * Core helper: load job state by jobId, resolving via sidecar index then slug dir.
 *
 * Resolution order (D4):
 *   1. resolveJobIdToSlug(repoRoot, jobId) → sidecar entry
 *   2a. kind="local", worktreePath set: try {worktreePath}/specrunner/changes/{slug}/state.json
 *   2b. kind="local", worktree not found: resolveCanonicalStateDir(slug, repoRoot) → archive / main-checkout
 *   3.  kind="managed": load from jobs-dir (managed scope preserved)
 *   4.  No sidecar entry: fallback to jobs-dir + legacy readFile (safety net, not a readdir scan)
 *
 * Read-only: never calls persist().
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveJobIdToSlug } from "../../store/local-job-index.js";
import { JobStateStore } from "../../store/job-state-store.js";
import type { NormalizedJobState } from "../../store/job-state-store.js";
import { resolveCanonicalStateDir } from "../finish/resolve-canonical-state-dir.js";
import { slugStateJsonPath } from "../../util/paths.js";

/**
 * Load job state by jobId, routing through the sidecar index to the canonical slug dir.
 *
 * @param repoRoot - Absolute path to the repo root.
 * @param jobId    - Full UUID of the job.
 * @returns NormalizedJobState from the most authoritative source.
 * @throws  ENOENT (or SpecRunnerError) when state cannot be found anywhere.
 */
export async function loadStateByJobId(
  repoRoot: string,
  jobId: string,
): Promise<NormalizedJobState> {
  const sidecarEntry = await resolveJobIdToSlug(repoRoot, jobId);

  if (sidecarEntry) {
    if (sidecarEntry.kind === "local") {
      // Step 2a: try worktreePath slug dir (active)
      if (sidecarEntry.worktreePath) {
        const stateJsonPath = path.join(
          sidecarEntry.worktreePath,
          slugStateJsonPath(sidecarEntry.slug),
        );
        try {
          await fs.access(stateJsonPath);
          return new JobStateStore(jobId, repoRoot, {
            slug: sidecarEntry.slug,
            stateRoot: sidecarEntry.worktreePath,
          }).load();
        } catch {
          // Not in worktree — fall through to canonical lookup
        }
      }

      // Step 2b: resolveCanonicalStateDir (archive / main-checkout)
      const canonDir = await resolveCanonicalStateDir(sidecarEntry.slug, repoRoot);
      if (canonDir) {
        return new JobStateStore(jobId, repoRoot, {
          slug: sidecarEntry.slug,
          stateRoot: repoRoot,
          changeDir: canonDir,
        }).load();
      }

      // No slug state found — fall through to jobs-dir fallback
    } else if (sidecarEntry.kind === "managed") {
      // Step 3: managed jobs use jobs-dir (managed scope preserved)
      return new JobStateStore(jobId, repoRoot).load();
    }
  }

  // Step 4: no sidecar entry, or local entry with no accessible slug state.
  // Fall back to jobs-dir split layout + legacy readFile (safety net — not a readdir scan).
  return new JobStateStore(jobId, repoRoot).load();
}
