/**
 * In-job coverage config re-resolver.
 *
 * Reads the project-local `.specrunner/config.json` from disk and returns the
 * current `verification.coverage` value.  Called by VerificationStep immediately
 * before each runVerification invocation so that edits made by build-fixer during
 * the same job are visible to subsequent verifications.
 *
 * Design decisions (D2 / D3 / D4):
 * - Returns only `verification.coverage` — no other config fields are exposed,
 *   limiting the re-load surface to coverage (gate weakening minimised).
 * - Requires `.specrunner/config.json` to exist in the repo.  Repos without a
 *   project-local config file get `applied: false` (regression-prevention gate).
 * - Never throws: I/O errors, JSON parse errors and validation errors all return
 *   `{ applied: false }` so a broken on-disk config does not crash the pipeline.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveRepoRoot } from "../../util/repo-root.js";
import { loadConfig } from "../../config/store.js";
import type { CoverageConfig } from "../../config/schema.js";

export interface ReloadCoverageConfigResult {
  /** Whether the project-local config was successfully re-read from disk. */
  applied: boolean;
  /**
   * The resolved `verification.coverage` value from the merged config.
   * Present (and possibly undefined) only when `applied === true`.
   * `undefined` means coverage is not declared in the current config.
   */
  coverage?: CoverageConfig;
}

/**
 * Re-read `verification.coverage` from disk for the given working directory.
 *
 * Steps:
 * 1. Resolve the git repo root from `cwd`.  Returns `{ applied: false }` when
 *    `cwd` is not inside a git repository.
 * 2. Verify that `<repoRoot>/.specrunner/config.json` exists.  Returns
 *    `{ applied: false }` when the file is absent (regression-prevention gate for
 *    repos that have no project-local config).
 * 3. Call `loadConfig(repoRoot)` to perform the full 2-layer overlay (user global
 *    + project local) and return `{ applied: true, coverage: config.verification?.coverage }`.
 * 4. On any exception (I/O, JSON parse, validation) return `{ applied: false }`.
 *
 * @param cwd - Working directory to start resolving from (typically the job worktree).
 */
export async function reloadCoverageConfig(cwd: string): Promise<ReloadCoverageConfigResult> {
  try {
    // Step 1: Resolve repo root.
    const repoRoot = await resolveRepoRoot(cwd);
    if (repoRoot === null) {
      return { applied: false };
    }

    // Step 2: Guard — project-local config must exist.
    const projectLocalPath = path.join(repoRoot, ".specrunner", "config.json");
    try {
      await fs.access(projectLocalPath);
    } catch {
      return { applied: false };
    }

    // Step 3: Load with full 2-layer overlay and extract coverage only.
    const config = await loadConfig(repoRoot);
    return { applied: true, coverage: config.verification?.coverage };
  } catch {
    // Step 4: Any unexpected error → fail-safe, do not crash the pipeline.
    return { applied: false };
  }
}
