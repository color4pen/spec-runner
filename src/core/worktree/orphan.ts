/**
 * Shared logic for orphan worktree detection and work inspection.
 *
 * An orphan worktree is a directory under `.git/specrunner-worktrees/` whose
 * directory name does NOT correspond to any non-terminal job state.
 *
 * Non-terminal statuses (protected): running, awaiting-resume, awaiting-archive,
 * failed, terminated.
 * Terminal statuses (not protected): archived, canceled.
 * Missing state → orphan (state was never written, i.e. the process died too early).
 *
 * This module is imported by:
 *   - src/core/doctor/checks/storage/orphan-worktrees.ts (read-only check)
 *   - src/core/prune/runner.ts (cleanup command)
 */
import * as path from "node:path";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrphanWorktree {
  /** Absolute path to the worktree directory. */
  worktreePath: string;
  /** Directory basename, e.g. "my-feature-a7d960d6". */
  dirName: string;
  /**
   * Branch name checked out in the worktree, without "refs/heads/" prefix.
   * null when the worktree is detached or the branch field was absent.
   */
  branch: string | null;
}

export interface WorkInspection {
  /** true if the worktree has uncommitted or unpushed work. */
  hasWork: boolean;
  /** Human-readable reasons why hasWork is true. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Non-terminal job statuses. Worktrees for jobs in these statuses are protected
 * and must not be treated as orphans.
 *
 * Aligned with the ACTIVE_STATUSES set in orphan-sidecars.ts.
 */
export const NON_TERMINAL_STATUSES = new Set([
  "running",
  "awaiting-resume",
  "awaiting-archive",
  "failed",
  "terminated",
]);

// ---------------------------------------------------------------------------
// Dependency injection types
// ---------------------------------------------------------------------------

export interface ScanDeps {
  repoRoot: string;
  spawn: SpawnFn;
  /** Override for listing known job states. Defaults to JobStateStore.list(repoRoot, { includeArchived: true }). */
  listStates?: () => Promise<JobState[]>;
}

// ---------------------------------------------------------------------------
// scanOrphanWorktrees
// ---------------------------------------------------------------------------

/**
 * Enumerate worktrees under `.git/specrunner-worktrees/` and return those
 * that are NOT mapped to any non-terminal job state.
 *
 * Algorithm:
 * 1. Run `git worktree list --porcelain` and parse worktree + branch lines.
 * 2. Keep only worktrees whose path is under `<repoRoot>/.git/specrunner-worktrees/`.
 * 3. Build the protected set: `${getJobSlug(state)}-${state.jobId.slice(0, 8)}` for
 *    each state whose status is in NON_TERMINAL_STATUSES.
 * 4. Return entries whose dirName is NOT in the protected set.
 *
 * Never throws: a missing base dir or a failing `git worktree list` resolves to [].
 */
export async function scanOrphanWorktrees(deps: ScanDeps): Promise<OrphanWorktree[]> {
  const { repoRoot, spawn } = deps;
  const listStates = deps.listStates ?? (() => JobStateStore.list(repoRoot, { includeArchived: true }));

  const baseDir = path.join(repoRoot, ".git", "specrunner-worktrees");

  // Step 1: Run git worktree list --porcelain
  let porcelainOutput: string;
  try {
    const result = await spawn("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot });
    if (result.exitCode !== 0) {
      return [];
    }
    porcelainOutput = result.stdout;
  } catch {
    return [];
  }

  // Step 2: Parse porcelain output into (worktreePath, branch) pairs
  const allWorktrees = parsePorcelainWorktrees(porcelainOutput);

  // Keep only those under .git/specrunner-worktrees/
  const specrunnerWorktrees = allWorktrees.filter((wt) =>
    isUnderBase(wt.worktreePath, baseDir),
  );

  if (specrunnerWorktrees.length === 0) {
    return [];
  }

  // Step 3: Build protected set from known non-terminal states
  let states: JobState[];
  try {
    states = await listStates();
  } catch {
    states = [];
  }

  const protectedDirNames = new Set<string>();
  for (const state of states) {
    if (NON_TERMINAL_STATUSES.has(state.status)) {
      const slug = getJobSlug(state);
      if (slug) {
        const jobId8 = state.jobId.slice(0, 8);
        protectedDirNames.add(`${slug}-${jobId8}`);
      }
    }
  }

  // Step 4: Filter out protected worktrees
  const orphans: OrphanWorktree[] = [];
  for (const wt of specrunnerWorktrees) {
    const dirName = path.basename(wt.worktreePath);
    if (!protectedDirNames.has(dirName)) {
      orphans.push({
        worktreePath: wt.worktreePath,
        dirName,
        branch: wt.branch,
      });
    }
  }

  return orphans;
}

// ---------------------------------------------------------------------------
// inspectWorktreeWork
// ---------------------------------------------------------------------------

/**
 * Check whether a worktree has uncommitted or unpushed work.
 *
 * Returns hasWork: true if:
 *   - `git -C <path> status --porcelain` produces non-empty output, OR
 *   - `git -C <path> rev-list --count HEAD --not --remotes` returns > 0.
 *
 * On any git error, returns hasWork: true (fail-safe: never delete when
 * the work state is unknown).
 */
export async function inspectWorktreeWork(
  worktreePath: string,
  spawn: SpawnFn,
): Promise<WorkInspection> {
  const reasons: string[] = [];

  // Check 1: uncommitted / untracked changes
  try {
    const statusResult = await spawn("git", ["status", "--porcelain"], { cwd: worktreePath });
    if (statusResult.exitCode !== 0) {
      reasons.push(`git status failed (exit ${statusResult.exitCode ?? "null"}): cannot determine uncommitted state`);
      return { hasWork: true, reasons };
    }
    if (statusResult.stdout.trim().length > 0) {
      reasons.push("has uncommitted or untracked changes");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`git status error: ${msg}`);
    return { hasWork: true, reasons };
  }

  // Check 2: unpushed commits
  try {
    const revListResult = await spawn(
      "git",
      ["rev-list", "--count", "HEAD", "--not", "--remotes"],
      { cwd: worktreePath },
    );
    if (revListResult.exitCode !== 0) {
      reasons.push(`git rev-list failed (exit ${revListResult.exitCode ?? "null"}): cannot determine unpushed state`);
      return { hasWork: true, reasons };
    }
    const count = parseInt(revListResult.stdout.trim(), 10);
    if (!Number.isNaN(count) && count > 0) {
      reasons.push(`has ${count} unpushed commit(s)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`git rev-list error: ${msg}`);
    return { hasWork: true, reasons };
  }

  return { hasWork: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ParsedWorktree {
  worktreePath: string;
  branch: string | null;
}

/**
 * Parse `git worktree list --porcelain` output.
 *
 * Each worktree block is separated by a blank line.
 * Relevant lines:
 *   worktree <path>
 *   branch refs/heads/<name>   (absent for detached HEAD)
 */
function parsePorcelainWorktrees(output: string): ParsedWorktree[] {
  const results: ParsedWorktree[] = [];

  // Split into blocks separated by blank lines
  const blocks = output.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let worktreePath: string | null = null;
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        // Strip "refs/heads/" prefix
        branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      }
    }

    if (worktreePath) {
      results.push({ worktreePath, branch });
    }
  }

  return results;
}

/**
 * Check whether `filePath` is strictly under `baseDir`
 * (i.e. `filePath` starts with `baseDir + path.sep`).
 */
function isUnderBase(filePath: string, baseDir: string): boolean {
  const normalized = path.normalize(filePath);
  const normalizedBase = path.normalize(baseDir);
  return normalized.startsWith(normalizedBase + path.sep) || normalized === normalizedBase;
}
