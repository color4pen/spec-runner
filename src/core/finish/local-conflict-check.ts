/**
 * Phase 0 local conflict check for finish command.
 *
 * Uses `git merge-tree --write-tree` (git 2.38+) to deterministically detect
 * merge conflicts before Phase 1 archive begins. This prevents the
 * "half-committed archive" failure mode where Phase 1 runs but the PR can't merge.
 *
 * Algorithm:
 *   1. git fetch origin <baseBranch>  — non-zero exit → throw (caller escalates)
 *   2. git merge-tree --write-tree HEAD origin/<baseBranch>
 *   3. exit code 0 → { ok: true }
 *   4. exit code !== 0 → parse stdout for CONFLICT lines → { ok: false, conflictPaths }
 */
import type { SpawnFn } from "../../util/spawn.js";

export interface LocalConflictCheckInput {
  baseBranch: string;
  cwd: string;
  spawn: SpawnFn;
}

export type LocalConflictCheckResult =
  | { ok: true }
  | { ok: false; conflictPaths: string[] };

/**
 * Run the local conflict check.
 *
 * Throws if `git fetch` fails (caller catches and escalates).
 * Returns { ok: true } if no conflicts, { ok: false, conflictPaths } if conflicts detected.
 */
export async function runLocalConflictCheck(
  input: LocalConflictCheckInput,
): Promise<LocalConflictCheckResult> {
  const { baseBranch, cwd, spawn } = input;

  // Step 1: git fetch origin <baseBranch>
  const fetchResult = await spawn("git", ["fetch", "origin", baseBranch], { cwd });
  if (fetchResult.exitCode !== 0) {
    throw new Error(
      `git fetch origin ${baseBranch} failed (exit ${fetchResult.exitCode}): ${fetchResult.stderr}`,
    );
  }

  // Step 2: git merge-tree --write-tree HEAD origin/<baseBranch>
  const mergeTreeResult = await spawn(
    "git",
    ["merge-tree", "--write-tree", "HEAD", `origin/${baseBranch}`],
    { cwd },
  );

  // Step 3: exit code 0 → no conflict
  if (mergeTreeResult.exitCode === 0) {
    return { ok: true };
  }

  // Step 4: exit code !== 0 → conflict. Parse stdout for CONFLICT lines.
  const conflictPaths = parseConflictPaths(mergeTreeResult.stdout);

  return { ok: false, conflictPaths };
}

/**
 * Parse conflict file paths from git merge-tree --write-tree stdout.
 *
 * git merge-tree outputs lines like:
 *   CONFLICT (content): Merge conflict in src/foo.ts
 *   CONFLICT (add/add): Merge conflict in README.md
 *   CONFLICT (modify/delete): file.txt deleted in branch-del and modified in HEAD.  Version HEAD of file.txt left in tree.
 *
 * Pattern 1 handles content/add-add conflicts ("Merge conflict in <path>").
 * Pattern 2 handles modify/delete conflicts ("<path> deleted/modified/added in ...").
 * Returns empty array if parsing fails — exit code is the authoritative conflict signal.
 */
function parseConflictPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes("CONFLICT")) continue;
    // Pattern 1: "Merge conflict in <path>" (content / add-add conflicts)
    const m1 = /Merge conflict in (.+)$/.exec(line);
    if (m1 && m1[1]) {
      paths.push(m1[1].trim());
      continue;
    }
    // Pattern 2: "<path> deleted in / modified in / added in" (modify/delete etc.)
    const m2 = /CONFLICT \([^)]+\): (.+?) (?:deleted|modified|added) in/.exec(line);
    if (m2 && m2[1]) {
      paths.push(m2[1].trim());
    }
  }
  return paths;
}
