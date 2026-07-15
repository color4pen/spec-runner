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
import type { WorkspaceSetupPlan } from "./setup.js";

export interface WorktreeManager {
  /**
   * Create a worktree at .git/specrunner-worktrees/<slug>-<jobId-short>/.
   * When branchName is provided, uses -b <branchName> so the worktree starts on that branch.
   * Otherwise uses --detach <baseRef> so the worktree starts from the specified ref.
   *
   * After `git worktree add` succeeds, the `plan` argument determines how setup is performed:
   *   - `{ kind: "detect-install" }` (default): detect package manager from repoRoot and run install.
   *   - `{ kind: "commands", commands }`: run the given command list via `sh -c` in the worktree.
   *   - `{ kind: "skip" }`: skip all install/setup (non-JS / greenfield projects).
   *
   * On setup failure, the worktree is cleaned up (git worktree remove --force + rm -rf) and an error is thrown.
   * Returns the worktree path.
   *
   * @param preserveBranchOnFailure - When true, this call does NOT delete the branch on
   *   `git worktree add` failure. Only branches that this call can prove it created should
   *   be deleted (ownership proof). When false/absent, the branch may be cleaned up on failure
   *   (original new-run behavior: this call created the branch and is responsible for cleanup).
   *   Defaults to false (cleanup on failure).
   *
   *   attach-from-checkpoint passes true unconditionally: combined `git worktree add -b`
   *   cannot atomically prove creation ownership, so cleanup is never attempted.
   *   new-run passes false (default): the branch did not exist before, so cleanup is safe.
   */
  create(repoRoot: string, slug: string, jobId: string, baseRef?: string, branchName?: string, plan?: WorkspaceSetupPlan, preserveBranchOnFailure?: boolean): Promise<string>;

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

  /**
   * Shared cleanup helper: remove worktree via git and rm -rf.
   * Called by both "detect-install" and "commands" failure paths.
   */
  async function cleanupWorktree(worktreePath: string, repoRoot: string): Promise<void> {
    await spawn("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
    await rm(worktreePath, { recursive: true, force: true });
  }

  return {
    async create(repoRoot: string, slug: string, jobId: string, baseRef?: string, branchName?: string, plan: WorkspaceSetupPlan = { kind: "detect-install" }, preserveBranchOnFailure = false): Promise<string> {
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
          // Best-effort branch cleanup to prevent collision on next run.
          // Only clean up branches that this call can prove it created (ownership proof).
          // preserveBranchOnFailure=true means we cannot prove ownership (e.g. attach-from-checkpoint
          // uses combined `git worktree add -b` which cannot atomically prove creation), so we
          // never delete the branch — deleting it could destroy existing commits that belong to
          // another invocation (race condition protection).
          if (branchName && !preserveBranchOnFailure) {
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

      // Execute setup according to the resolved plan
      if (plan.kind === "detect-install") {
        // Default: detect package manager from repoRoot and run install in worktreePath
        const pm = await detectPm(repoRoot);
        const [installCmd, ...installArgs] = installCommand(pm);
        const installResult = await spawn(installCmd, installArgs, { cwd: worktreePath });
        if (installResult.exitCode !== 0) {
          await cleanupWorktree(worktreePath, repoRoot);
          throw new Error(
            `${installCmd} install failed (exit ${installResult.exitCode}): ${installResult.stderr.trim()}`,
          );
        }
      } else if (plan.kind === "commands") {
        // Config-driven: run user-specified commands via sh -c
        for (const cmd of plan.commands) {
          const result = await spawn("sh", ["-c", cmd.run], { cwd: worktreePath });
          if (result.exitCode !== 0) {
            const label = cmd.name ?? cmd.run;
            await cleanupWorktree(worktreePath, repoRoot);
            throw new Error(
              `Setup command '${label}' failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
            );
          }
        }
        // Empty array: nothing to run, fall through to return worktreePath
      }
      // plan.kind === "skip": do nothing

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
