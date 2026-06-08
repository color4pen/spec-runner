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
import { stderrWrite } from "../../logger/stdout.js";
import { detectPackageManager, installCommand } from "../../util/detect-pm.js";
import type { PackageManager } from "../../util/detect-pm.js";

export interface WorktreeManager {
  /**
   * Create a worktree at .git/specrunner-worktrees/<slug>-<jobId-short>/.
   * When branchName is provided, uses -b <branchName> so the worktree starts on that branch.
   * Otherwise uses --detach <baseRef> so the worktree starts from the specified ref.
   * Detects the package manager from repoRoot and runs the appropriate install command.
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

/** Type alias for the injectable sleep function (avoids real delays in tests). */
type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a WorktreeManager with optional DI (for testing).
 * spawnFn: replaces git/pm invocations.
 * rmFn: replaces fs.rm calls (avoids module-level mock conflicts in tests).
 * sleepFn: replaces setTimeout-based delay (avoids real delays in tests).
 * detectPmFn: replaces package manager detection (avoids real fs access in tests).
 */
export function createWorktreeManager(
  spawnFn?: SpawnFn,
  rmFn?: RmFn,
  sleepFn?: SleepFn,
  detectPmFn?: (cwd: string) => Promise<PackageManager>,
): WorktreeManager {
  const spawn = spawnFn ?? spawnCommand;
  const rm = rmFn ?? ((p: string, opts?: { recursive?: boolean; force?: boolean }) =>
    fs.rm(p, opts));
  const sleep = sleepFn ?? defaultSleep;
  const detectPm = detectPmFn ?? (async (c: string): Promise<PackageManager> => (await detectPackageManager(c)).pm);

  return {
    async create(repoRoot: string, slug: string, jobId: string, baseRef?: string, branchName?: string): Promise<string> {
      const worktreePath = buildWorktreePath(repoRoot, slug, jobId);
      const ref = baseRef ?? "HEAD";

      // git worktree add [-b <branchName> | --detach] <path> <ref>
      let wtArgs = branchName
        ? ["worktree", "add", "-b", branchName, worktreePath, ref]
        : ["worktree", "add", "--detach", worktreePath, ref];

      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const wtResult = await spawn("git", wtArgs, { cwd: repoRoot });
        if (wtResult.exitCode === 0) break;

        const isLockContention = wtResult.stderr.includes("could not lock config file");
        if (!isLockContention || attempt === MAX_RETRIES) {
          // Best-effort branch cleanup to prevent collision on next run
          if (branchName) {
            await spawn("git", ["branch", "-D", branchName], { cwd: repoRoot });
          }
          throw new Error(
            `git worktree add failed (exit ${wtResult.exitCode}): ${wtResult.stderr.trim()}`,
          );
        }

        // Lock contention: check if branch was partially created before retrying
        if (branchName) {
          const revParseResult = await spawn(
            "git",
            ["rev-parse", "--verify", `refs/heads/${branchName}`],
            { cwd: repoRoot },
          );
          if (revParseResult.exitCode === 0) {
            // Branch exists but worktree dir was not created; use existing branch (no -b)
            wtArgs = ["worktree", "add", worktreePath, branchName];
          }
          // If rev-parse fails, branch was not created; keep original -b args
        }

        const delayMs = 1000 + Math.floor(Math.random() * 4000);
        stderrWrite(`Retrying worktree add: lock contention (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(delayMs);
      }

      // Detect package manager from repoRoot and run install in worktreePath
      const pm = await detectPm(repoRoot);
      const [installCmd, ...installArgs] = installCommand(pm);
      const installResult = await spawn(installCmd, installArgs, { cwd: worktreePath });
      if (installResult.exitCode !== 0) {
        // Cleanup worktree before throwing
        await spawn("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
        await rm(worktreePath, { recursive: true, force: true });
        throw new Error(
          `${installCmd} install failed (exit ${installResult.exitCode}): ${installResult.stderr.trim()}`,
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
