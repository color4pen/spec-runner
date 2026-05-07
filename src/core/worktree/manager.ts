/**
 * WorktreeManager: manages git worktrees for job execution isolation.
 *
 * Each local-runtime job gets a dedicated worktree at:
 *   <repoRoot>/.git/specrunner-worktrees/<slug>-<jobId-short>/
 *
 * This keeps the main checkout clean: no untracked files, no branch pollution.
 *
 * 3-layer cleanup:
 *   1. Signal handler (SIGINT/SIGTERM) in run.ts
 *   2. state file worktreePath for crash recovery
 *   3. git worktree prune for orphan references
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";

export interface WorktreeManager {
  /**
   * Create a worktree at .git/specrunner-worktrees/<slug>-<jobId-short>/.
   * When branchName is provided, uses -b <branchName> so the worktree starts on that branch.
   * Otherwise uses --detach <baseRef> so the worktree starts from the specified ref.
   * Runs bun install --frozen-lockfile after creation.
   * Returns the worktree path.
   */
  create(repoRoot: string, slug: string, jobId: string, baseRef?: string, branchName?: string): Promise<string>;

  /**
   * Remove a worktree: git worktree remove --force + rm -rf.
   * repoRoot is passed explicitly to avoid fragile path.dirname derivation.
   */
  remove(worktreePath: string, repoRoot: string): Promise<void>;

  /**
   * Prune orphan worktree references.
   */
  prune(repoRoot: string): Promise<void>;
}

/**
 * Build the canonical worktree path for a given slug + jobId.
 */
export function buildWorktreePath(repoRoot: string, slug: string, jobId: string): string {
  const jobIdShort = jobId.slice(0, 8);
  return path.join(repoRoot, ".git", "specrunner-worktrees", `${slug}-${jobIdShort}`);
}

/** Type alias for the injectable rm function (matches fs.rm signature subset used here). */
type RmFn = (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>;

/**
 * Create a WorktreeManager with optional DI (for testing).
 * spawnFn: replaces git/bun invocations.
 * rmFn: replaces fs.rm calls (avoids module-level mock conflicts in tests).
 */
export function createWorktreeManager(spawnFn?: SpawnFn, rmFn?: RmFn): WorktreeManager {
  const spawn = spawnFn ?? spawnCommand;
  const rm = rmFn ?? ((p: string, opts?: { recursive?: boolean; force?: boolean }) =>
    fs.rm(p, opts));

  return {
    async create(repoRoot: string, slug: string, jobId: string, baseRef?: string, branchName?: string): Promise<string> {
      const worktreePath = buildWorktreePath(repoRoot, slug, jobId);
      // TODO(base-branch): configurable base branch
      const ref = baseRef ?? "HEAD";

      // git worktree add [-b <branchName> | --detach] <path> <ref>
      const wtArgs = branchName
        ? ["worktree", "add", "-b", branchName, worktreePath, ref]
        : ["worktree", "add", "--detach", worktreePath, ref];

      const wtResult = await spawn(
        "git",
        wtArgs,
        { cwd: repoRoot },
      );
      if (wtResult.exitCode !== 0) {
        throw new Error(
          `git worktree add failed (exit ${wtResult.exitCode}): ${wtResult.stderr.trim()}`,
        );
      }

      // bun install --frozen-lockfile
      const installResult = await spawn(
        "bun",
        ["install", "--frozen-lockfile"],
        { cwd: worktreePath },
      );
      if (installResult.exitCode !== 0) {
        // Cleanup worktree before throwing
        await spawn("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
        await rm(worktreePath, { recursive: true, force: true });
        throw new Error(
          `bun install failed (exit ${installResult.exitCode}): ${installResult.stderr.trim()}`,
        );
      }

      return worktreePath;
    },

    async remove(worktreePath: string, repoRoot: string): Promise<void> {
      await spawn("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
      // Belt-and-suspenders: also rm -rf in case of git errors
      await rm(worktreePath, { recursive: true, force: true });
    },

    async prune(repoRoot: string): Promise<void> {
      await spawn("git", ["worktree", "prune"], { cwd: repoRoot });
    },
  };
}
