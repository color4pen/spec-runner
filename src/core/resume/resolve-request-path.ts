/**
 * resolveRequestPath: resolve the actual request.md path for job resume.
 *
 * When state.request.path was recorded before the fix (points to a deleted draft),
 * fall back to the permanent copy inside the change folder.
 *
 * Fallback order:
 *   1. <worktreePath>/specrunner/changes/<slug>/request.md  (local runtime, worktree exists)
 *   2. <cwd>/specrunner/changes/<slug>/request.md           (managed runtime or worktree deleted)
 *   3. statePath as-is                                       (caller gets ENOENT)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { requestMdPath } from "../../util/paths.js";

/**
 * Resolve the effective request.md path for a job resume.
 *
 * @param statePath   - Value of state.request.path (may point to a deleted draft)
 * @param slug        - Job slug (from getJobSlug(state))
 * @param worktreePath - state.worktreePath (null for managed runtime or when worktree was deleted)
 * @param cwd         - Current working directory (process.cwd() in production)
 * @returns The first existing candidate path, or statePath if none exist.
 */
export function resolveRequestPath(
  statePath: string,
  slug: string,
  worktreePath: string | null | undefined,
  cwd: string,
): string {
  // Not a legacy draft path — use as-is
  if (!statePath.includes("/specrunner/drafts/")) {
    return statePath;
  }

  // First candidate: worktree-based permanent copy (local runtime)
  if (worktreePath) {
    const candidate = path.join(worktreePath, requestMdPath(slug));
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Second candidate: cwd-based permanent copy (managed runtime / worktree deleted)
  const cwdCandidate = path.join(cwd, requestMdPath(slug));
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  // Both candidates absent — return original; caller will get ENOENT
  return statePath;
}
