/**
 * Git branch helpers.
 */
import { gitExec, defaultSpawnFn } from "../util/git-exec.js";

/**
 * Return the name of the current branch in `cwd`, or null when:
 * - the repo is in detached HEAD state
 * - `cwd` is not a git repository
 * - any git error occurs
 *
 * Never throws.
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await gitExec(defaultSpawnFn, cwd, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (result === null || result === "") return null;
  return result;
}
