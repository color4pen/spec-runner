/**
 * Writable state store resolver: given a jobId, resolve the appropriate
 * JobStateStore for writing (persist) based on sidecar index.
 *
 * Resolution order (D4 — writable variant):
 *   1. sidecar entry kind="local": worktree slug dir (worktreePath, verified) →
 *                                  resolveCanonicalStateDir (archive / main-checkout)
 *                                  → null (no accessible store found)
 *   2. sidecar entry kind="managed": .specrunner/local/<slug>/ (changeDir seam)
 *   3. No sidecar entry: jobId-based store (legacy safety net)
 *
 * Returns null when no writable slug store is accessible (local, degraded).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveJobIdToSlug } from "../../store/local-job-index.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { resolveCanonicalStateDir } from "../finish/resolve-canonical-state-dir.js";
import { slugStateJsonPath, localSidecarDir } from "../../util/paths.js";

/**
 * Resolve a writable JobStateStore for the given jobId.
 *
 * @param repoRoot - Absolute path to the repo root.
 * @param jobId    - Full UUID of the job.
 * @returns JobStateStore pointing to the canonical writable location, or null
 *          when no slug store is accessible (local degraded — caller should skip).
 */
export async function resolveStateStoreByJobId(
  repoRoot: string,
  jobId: string,
): Promise<JobStateStore | null> {
  const sidecarEntry = await resolveJobIdToSlug(repoRoot, jobId);

  if (sidecarEntry) {
    if (sidecarEntry.kind === "local") {
      // Step 1a: try worktreePath slug dir (active)
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
          });
        } catch {
          // Not in worktree — fall through to canonical lookup
        }
      }

      // Step 1b: resolveCanonicalStateDir (archive / main-checkout)
      const canonDir = await resolveCanonicalStateDir(sidecarEntry.slug, repoRoot);
      if (canonDir) {
        return new JobStateStore(jobId, repoRoot, {
          slug: sidecarEntry.slug,
          stateRoot: repoRoot,
          changeDir: canonDir,
        });
      }

      // No accessible slug store for this local job
      return null;
    } else if (sidecarEntry.kind === "managed") {
      // Step 2: managed jobs use .specrunner/local/<slug>/ (D4)
      return new JobStateStore(jobId, repoRoot, {
        changeDir: path.join(repoRoot, localSidecarDir(sidecarEntry.slug)),
      });
    }
  }

  // Step 3: no sidecar entry — fallback to jobId-based store (legacy safety net)
  return new JobStateStore(jobId, repoRoot);
}
