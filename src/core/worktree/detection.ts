/**
 * Detects whether the current working directory is inside a git worktree
 * (as opposed to the main worktree).
 *
 * Detection strategy: `.git` is a file in worktrees, a directory in the main worktree.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface WorktreeDetectionResult {
  isWorktree: boolean;
  /** Absolute path to the main worktree root. Only set when isWorktree === true. */
  mainWorktreePath?: string;
}

/**
 * Detect whether `cwd` is a git worktree.
 *
 * - `.git` is a directory → main worktree → `{ isWorktree: false }`
 * - `.git` is a file     → linked worktree → parse `gitdir:` to find main path
 * - `.git` does not exist → not a git repo → `{ isWorktree: false }`
 *   (the caller's preflight will catch NOT_GIT_REPO independently)
 */
export async function detectWorktree(cwd: string): Promise<WorktreeDetectionResult> {
  const gitPath = path.join(cwd, ".git");

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(gitPath);
  } catch {
    // ENOENT or any other error: not a git repo, not a worktree
    return { isWorktree: false };
  }

  if (stat.isDirectory()) {
    return { isWorktree: false };
  }

  if (stat.isFile()) {
    // Parse the gitdir pointer file: "gitdir: <relative-or-absolute-path>\n"
    const contents = await fs.readFile(gitPath, "utf8");
    const match = contents.match(/^gitdir:\s*(.+)$/m);
    if (!match) {
      // Malformed .git file — treat as not a worktree
      return { isWorktree: false };
    }

    const gitdirValue = (match[1] ?? "").trim();
    // The gitdir value points to something like:
    //   ../../.git/specrunner-worktrees/slug-abc12345
    // We need to derive the main worktree root from it.
    //
    // Resolve the gitdir path relative to `cwd`.
    const gitdirAbsolute = path.resolve(cwd, gitdirValue);

    // The main worktree root is the parent of the `.git` directory that the
    // gitdir path lives inside.  For the canonical specrunner layout:
    //   /repo/.git/specrunner-worktrees/slug-abc12345
    // we want /repo — which is path.dirname(path.dirname(path.dirname(gitdirAbsolute))).
    //
    // More generally: walk up from gitdirAbsolute until we find the `.git`
    // directory component, then take its parent.
    const mainWorktreePath = deriveMainWorktreePath(gitdirAbsolute);
    return { isWorktree: true, mainWorktreePath };
  }

  // Symlink or other — conservatively treat as not a worktree
  return { isWorktree: false };
}

// ---------------------------------------------------------------------------
// detectSpecrunnerWorktree
// ---------------------------------------------------------------------------

export interface SpecrunnerWorktreeResult {
  isSpecrunnerWorktree: boolean;
  /**
   * The main checkout root (parent of `.git`).
   * Only set when isSpecrunnerWorktree === true.
   */
  mainCheckoutPath?: string;
}

/**
 * Detect whether `cwd` is inside a specrunner job worktree
 * (i.e. under `<repo-root>/.git/specrunner-worktrees/`).
 *
 * Detection strategy:
 *   1. Resolve `cwd` with fs.realpath to normalise symlinks.
 *   2. Split the resolved path into segments.
 *   3. Look for a `.git` segment immediately followed by `specrunner-worktrees`.
 *   4. If found, the main checkout root is the directory above `.git`.
 *
 * Fail-open: if `fs.realpath` throws (non-existent path etc.) or no matching
 * pattern is found, returns `{ isSpecrunnerWorktree: false }`.
 *
 * Note: does NOT touch the existing `detectWorktree` function.
 */
export async function detectSpecrunnerWorktree(cwd: string): Promise<SpecrunnerWorktreeResult> {
  let resolved: string;
  try {
    resolved = await fs.realpath(cwd);
  } catch {
    // Non-existent or inaccessible path → fail-open
    return { isSpecrunnerWorktree: false };
  }

  const parts = resolved.split(path.sep);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === ".git" && parts[i + 1] === "specrunner-worktrees") {
      // Everything before the `.git` segment is the main checkout root.
      const mainCheckoutPath = parts.slice(0, i).join(path.sep) || path.sep;
      return { isSpecrunnerWorktree: true, mainCheckoutPath };
    }
  }

  return { isSpecrunnerWorktree: false };
}

/**
 * Given an absolute gitdir path (e.g. /repo/.git/specrunner-worktrees/slug-abc),
 * return the main worktree root (e.g. /repo).
 *
 * Strategy: find the `.git` segment in the path and return its parent.
 */
function deriveMainWorktreePath(gitdirAbsolute: string): string {
  const parts = gitdirAbsolute.split(path.sep);
  // Walk from the end to find the `.git` directory
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === ".git") {
      // Parent of .git
      return parts.slice(0, i).join(path.sep) || path.sep;
    }
  }
  // Fallback: two levels up from gitdirAbsolute (gitdir is a direct child of .git)
  return path.dirname(path.dirname(gitdirAbsolute));
}
