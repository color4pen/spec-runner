/**
 * Post-merge cleanup for `job archive --with-merge`.
 *
 * Runs ONLY after a successful PR merge. Cleans up worktree, feature branch, and sidecars.
 * Does NOT write job status — base working tree is never dirtied.
 *
 * Design: best-effort and idempotent. Missing worktree / branch / sidecar → no-op.
 */
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { createWorktreeManager } from "../worktree/manager.js";
import { livenessJsonPath, managedMarkerPath, localSidecarDir } from "../../util/paths.js";
import { isRemoteRefNotFound } from "../../util/git-push.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";

export interface PostMergeCleanupInput {
  /** Slug of the archived job. */
  slug: string;
  /** Main repo root (cwd). Must not be inside a worktree. */
  cwd: string;
  /** Feature branch name (from job state). Null → branch cleanup skipped. */
  branch: string | null;
  /** Worktree path (from job state). Null → worktree cleanup skipped. */
  worktreePath: string | null;
  /** True for --no-worktree mode jobs. */
  noWorktree: boolean;
  /** Base branch to checkout in no-worktree mode before deleting local feature branch. */
  baseBranch: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** Injectable WorktreeManager for testing. */
  worktreeManagerFn?: () => WorktreeManager;
}

/**
 * Run post-merge cleanup: remove worktree, delete feature branch, clean up sidecars.
 *
 * Best-effort: logs warnings on failure, does not throw.
 * Does NOT write job status or touch base branch.
 */
export async function runPostMergeCleanup(
  input: PostMergeCleanupInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<void> {
  const { slug, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn } = input;

  stdoutWrite(
    noWorktree
      ? "Cleanup: removing branches and sidecars..."
      : "Cleanup: removing worktree, branches, and sidecars...",
  );

  // Worktree removal (worktree mode only)
  if (worktreePath && !noWorktree) {
    const manager = worktreeManagerFn ? worktreeManagerFn() : createWorktreeManager();
    try {
      await manager.remove(worktreePath, cwd);
      await manager.prune(cwd);
    } catch {
      stderrWrite(`Warning: failed to remove worktree at ${worktreePath}. Run 'git worktree prune' manually.`);
    }
  } else if (!noWorktree && !worktreePath) {
    stderrWrite(
      `Warning: worktree path could not be resolved for ${slug}. Worktree may remain on disk.\n` +
        `Run 'git worktree list' to check and 'git worktree prune' to clean up if needed.`,
    );
  }

  // Delete liveness.json sidecar (best-effort)
  try {
    await fs.unlink(nodePath.join(cwd, livenessJsonPath(slug)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      stderrWrite(`Warning: failed to delete liveness sidecar for ${slug}.`);
    }
  }

  // Delete managed marker (best-effort)
  try {
    await fs.unlink(nodePath.join(cwd, managedMarkerPath(slug)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      stderrWrite(`Warning: failed to delete managed marker for ${slug}.`);
    }
  }

  // Delete sidecar directory (best-effort)
  try {
    await fs.rm(nodePath.join(cwd, localSidecarDir(slug)), { recursive: true, force: true });
  } catch {
    stderrWrite(`Warning: failed to remove sidecar directory for ${slug}.`);
  }

  // Delete feature branch
  if (branch) {
    // For no-worktree mode: checkout baseBranch first to leave the feature branch
    // (this checkout does NOT commit or push to base — it only switches the working tree)
    if (noWorktree) {
      const checkoutResult = await spawn("git", ["checkout", baseBranch], { cwd });
      if (checkoutResult.exitCode !== 0) {
        stderrWrite(`Warning: failed to checkout ${baseBranch} before deleting branch ${branch}.`);
      }
    }

    const localDelResult = await spawn("git", ["branch", "-D", branch], { cwd });
    if (localDelResult.exitCode !== 0) {
      stderrWrite(`Warning: failed to delete local branch ${branch}.`);
    }
    const remoteDelResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd });
    if (remoteDelResult.exitCode !== 0 && !isRemoteRefNotFound(remoteDelResult.stderr)) {
      stderrWrite(`Warning: failed to delete remote branch ${branch}.`);
    }
  }
}
