/**
 * Operator canon apply helpers for resume --apply-canon.
 *
 * Provides two exported functions:
 *   - detectCanonDirtyPaths: enumerate dirty protected canon paths in the worktree.
 *   - commitOperatorCanon: commit those paths with an operator-apply commit message.
 *
 * Design:
 *   - detectCanonDirtyPaths is fail-closed: throws on git status failure so that
 *     "git status failed" is never confused with "no dirty canon paths".
 *   - commitOperatorCanon commits ONLY the specified paths (explicit pathspec git add).
 *     Non-canon dirty files in the worktree are intentionally left untouched.
 */

import { protectedCanonPaths } from "../step/write-scope.js";
import { runSubprocess, gitExec, type SpawnFn } from "../../util/git-exec.js";

/**
 * Enumerate the protected canon paths that are dirty in the given worktree.
 *
 * Runs `git status --porcelain -z --no-renames -- <protectedCanonPaths>` and parses NUL-delimited output.
 * Explicit pathspecs ensure individual file entries are shown even when canon paths live in
 * a completely untracked directory (otherwise git would show `?? specrunner/` instead of each file).
 * Each entry is `"XY PATH"` (2-char XY status code + space + path).
 *
 * A path is considered dirty when:
 *   - X !== ' ' (staged change), OR
 *   - Y !== ' ' AND Y !== '?' (worktree change; '?' alone = untracked, excluded unless canon)
 *
 * Untracked files (XY = '??') are included only if they are in the protected canon set
 * (e.g. an operator added a new canon file that was not previously tracked).
 *
 * Returns only paths that are in protectedCanonPaths(slug) AND are dirty per the above rules.
 *
 * Throws when git status exits non-zero — fail-closed (R2 guarantee).
 *
 * @param slug         - Job slug (used to compute protected canon path set).
 * @param worktreePath - Absolute path to the git worktree.
 * @param spawnFn      - Spawn function (injected; callers must not use defaultSpawnFn here).
 * @returns            Array of dirty protected canon paths (worktree-relative, may be empty).
 */
export async function detectCanonDirtyPaths(
  slug: string,
  worktreePath: string,
  spawnFn: SpawnFn,
): Promise<string[]> {
  const result = await runSubprocess(
    spawnFn,
    "git",
    ["status", "--porcelain", "-z", "--no-renames", "--", ...protectedCanonPaths(slug)],
    { cwd: worktreePath },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `git status failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }

  const canonSet = new Set(protectedCanonPaths(slug));
  const dirtyCanon: string[] = [];

  // git status --porcelain -z: output is NUL-terminated entries, each "XY PATH\0"
  // Split on NUL and filter empty strings.
  const entries = result.stdout.split("\0").filter((e) => e.length > 0);

  for (const entry of entries) {
    // Each entry: 2 chars XY + 1 space + path (minimum 4 chars: "XY P")
    if (entry.length < 4) continue;

    const x = entry[0]!;
    const y = entry[1]!;
    const filePath = entry.slice(3);

    // Determine if the entry represents a dirty state
    const stagedDirty = x !== " ";
    // Y=? means untracked (in worktree), Y=' ' means clean in worktree
    const worktreeDirty = y !== " " && y !== "?";
    // Special case: XY='??' is fully untracked — include only if in protected canon set
    const isUntracked = x === "?" && y === "?";

    const isDirty = stagedDirty || worktreeDirty || isUntracked;
    if (isDirty && canonSet.has(filePath)) {
      dirtyCanon.push(filePath);
    }
  }

  return dirtyCanon;
}

/**
 * Create an operator-apply commit containing only the specified protected canon paths.
 *
 * Steps:
 *   1. `git add -A` — stage everything; non-canon files remain staged but are not committed.
 *   2. `git commit -m "operator-apply: <slug>" -- <paths>` — commit only the specified canon paths.
 *   3. `git rev-parse HEAD` — retrieve the new commit OID.
 *
 * Throws if any git command fails.
 *
 * @param slug         - Job slug (used to build the commit message).
 * @param worktreePath - Absolute path to the git worktree.
 * @param paths        - Worktree-relative paths to stage and commit (should be non-empty).
 * @param spawnFn      - Spawn function (injected; callers must not use defaultSpawnFn here).
 * @returns            The new commit OID (trimmed HEAD) as a non-empty string.
 */
export async function commitOperatorCanon(
  slug: string,
  worktreePath: string,
  paths: string[],
  spawnFn: SpawnFn,
): Promise<string> {
  // Step 1: git add -A — stage everything (including non-canon files) so that git can
  // see canon paths even when they live in a completely untracked directory.
  // Non-canon files remain staged after the commit, making them visible as individual
  // entries (e.g. `A  src/feature.ts`) rather than collapsed directory entries.
  const addResult = await runSubprocess(
    spawnFn,
    "git",
    ["add", "-A"],
    { cwd: worktreePath },
  );
  if (addResult.exitCode !== 0) {
    throw new Error(
      `git add failed (exit ${addResult.exitCode}): ${addResult.stderr.trim()}`,
    );
  }

  // Step 2: git commit -m "operator-apply: <slug>" -- <paths>
  const commitMessage = `operator-apply: ${slug}`;
  const commitResult = await runSubprocess(
    spawnFn,
    "git",
    ["commit", "-m", commitMessage, "--", ...paths],
    { cwd: worktreePath },
  );
  if (commitResult.exitCode !== 0) {
    throw new Error(
      `git commit failed (exit ${commitResult.exitCode}): ${commitResult.stderr.trim()}`,
    );
  }

  // Step 3: git rev-parse HEAD
  const oid = await gitExec(spawnFn, worktreePath, ["rev-parse", "HEAD"]);
  if (oid === null) {
    throw new Error("git rev-parse HEAD failed: could not retrieve new commit OID");
  }

  return oid;
}
