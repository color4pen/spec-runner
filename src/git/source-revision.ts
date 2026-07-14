/**
 * source-revision — helper to read the source revision for fact-check attestation.
 *
 * Returns the SHA of the most recent commit that touched files outside the
 * change folder (specrunner/changes/). This value is stable across pipeline
 * metadata commits (which only touch the change folder) and changes only when
 * actual source files are committed.
 *
 * Design constraint: do NOT import from src/adapter/ — this is a src/git/ module.
 * Imports are limited to src/util/git-exec.js and src/util/paths.js.
 */
import { gitExec, defaultSpawnFn } from "../util/git-exec.js";
import { changesDirRel } from "../util/paths.js";

/**
 * Read the source revision for the given working directory.
 *
 * Returns the SHA of the most recent commit that modified any file outside
 * the change folder (specrunner/changes/). Pipeline metadata commits that
 * only modify the change folder are excluded, so this value is stable between
 * request-review and design even when both steps commit their outputs.
 *
 * Returns null when:
 * - The directory is not a git repository.
 * - git is not available.
 * - There are no commits outside the change folder (empty history).
 * - Any git error occurs.
 *
 * Never throws — all failures are swallowed and return null.
 */
export async function readSourceRevision(cwd: string): Promise<string | null> {
  const excludePathspec = `:(exclude)${changesDirRel()}`;
  const result = await gitExec(defaultSpawnFn, cwd, [
    "rev-list",
    "-1",
    "HEAD",
    "--",
    ".",
    excludePathspec,
  ]);
  if (result === null || result === "") {
    return null;
  }
  return result;
}
