/**
 * Archive cleanup: worktree teardown, branch deletion, and sidecar removal.
 *
 * Common cleanup for archive operations. Remote branch deletion is opt-out via
 * `deleteRemoteBranch` — plain archive keeps the remote branch alive (PR still OPEN),
 * while `--with-merge` deletes it after merging.
 *
 * Design: best-effort and idempotent. Missing worktree / branch / sidecar → no-op.
 * Does NOT write job status or touch base branch.
 */
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { createWorktreeManager } from "../worktree/manager.js";
import { livenessJsonPath, managedMarkerPath, localSidecarDir } from "../../util/paths.js";
import { isRemoteRefNotFound } from "../../util/git-push.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";

export interface ArchiveCleanupInput {
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
  /**
   * Whether to delete the remote feature branch.
   * Defaults to `true` (delete remote branch — used by the --with-merge path).
   * Set to `false` for plain archive (PR still OPEN; remote branch must survive for the PR).
   */
  deleteRemoteBranch?: boolean;
}

/**
 * Run archive cleanup: remove worktree, delete feature branch, clean up sidecars.
 *
 * Best-effort: logs warnings on failure, does not throw.
 * Does NOT write job status or touch base branch.
 *
 * When `deleteRemoteBranch === false`, the remote branch is preserved and an advisory
 * is printed to stdout instructing the operator how to restore it if needed.
 */
export async function runArchiveCleanup(
  input: ArchiveCleanupInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<void> {
  const { slug, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn } = input;
  const deleteRemoteBranch = input.deleteRemoteBranch !== false; // default true

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

    if (deleteRemoteBranch) {
      const remoteDelResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd });
      if (remoteDelResult.exitCode !== 0 && !isRemoteRefNotFound(remoteDelResult.stderr)) {
        stderrWrite(`Warning: failed to delete remote branch ${branch}.`);
      }
    } else {
      stdoutWrite(
        `Remote branch '${branch}' was kept (PR is still open). ` +
        `If you need to restore it locally: git fetch origin ${branch}`,
      );
    }
  }
}
