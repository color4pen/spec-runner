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
        } catch (err) {
          // Re-throw journal corruption — must not be silently swallowed or
          // masked by falling through to canonical lookup.
          if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOURNAL_CORRUPTED) {
            throw err;
          }
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

  // Fallback: sidecar index had no match (e.g. liveness.json carries a foreign jobId).
  // Scan specrunner/changes/<slug>/state.json directly for a matching jobId.
  const changesDir = path.join(repoRoot, "specrunner", "changes");
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "archive" || entry.name === "canceled") continue;
      const slug = entry.name;
      const stateJsonPath = path.join(changesDir, slug, "state.json");
      try {
        const raw = JSON.parse(await fs.readFile(stateJsonPath, "utf-8")) as Record<string, unknown>;
        if (raw["jobId"] !== jobId) continue;
        return new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot }).load();
      } catch {
        continue;
      }
    }
  } catch {
    // ENOENT on changesDir or other I/O error — fall through to JOB_NOT_FOUND
  }

  throw new SpecRunnerError(
    ERROR_CODES.JOB_NOT_FOUND,
    "Run specrunner job ls to list available job IDs.",
    `Job not found: ${jobId}`,
  );
}
