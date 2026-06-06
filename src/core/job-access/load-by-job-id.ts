/**
 * Core helper: load job state by jobId, resolving via sidecar index then slug dir.
 *
 * Resolution order (D4):
 *   1. resolveJobIdToSlug(repoRoot, jobId) → sidecar entry
 *   2a. kind="local", worktreePath set: try {worktreePath}/specrunner/changes/{slug}/state.json
 *   2b. kind="local", worktree not found: resolveCanonicalStateDir(slug, repoRoot) → archive / main-checkout
 *   3.  kind="managed": load from .specrunner/local/<slug>/ (changeDir seam)
 *   No sidecar entry or unresolvable local entry: throws JOB_NOT_FOUND.
 *
 * Read-only: never calls persist().
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveJobIdToSlug } from "../../store/local-job-index.js";
import { JobStateStore } from "../../store/job-state-store.js";
import type { NormalizedJobState } from "../../store/job-state-store.js";
import { resolveCanonicalStateDir } from "../finish/resolve-canonical-state-dir.js";
import { slugStateJsonPath, localSidecarDir } from "../../util/paths.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

/**
 * Load job state by jobId, routing through the sidecar index to the canonical slug dir.
 *
 * @param repoRoot - Absolute path to the repo root.
 * @param jobId    - Full UUID of the job.
 * @returns NormalizedJobState from the most authoritative source.
 * @throws  SpecRunnerError(JOB_NOT_FOUND) when state cannot be resolved.
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

      // No accessible slug state for this local job
    } else if (sidecarEntry.kind === "managed") {
      // Step 3: managed jobs use .specrunner/local/<slug>/ (D4)
      return new JobStateStore(jobId, repoRoot, {
        changeDir: path.join(repoRoot, localSidecarDir(sidecarEntry.slug)),
      }).load();
    }
  }

  // No sidecar entry, or local entry with no accessible slug state: unresolvable.
  throw new SpecRunnerError(
    ERROR_CODES.JOB_NOT_FOUND,
    "Run 'specrunner ps' to list available job IDs.",
    `Job not found: ${jobId}`,
  );
}
