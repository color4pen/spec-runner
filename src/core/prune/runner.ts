/**
 * Core logic for `specrunner job prune` command.
 *
 * Removes orphan worktrees (worktrees with no associated non-terminal job state)
 * and their local branches.
 *
 * Design:
 * D1: Default is dry-run (no deletions without --force)
 * D2: Worktrees with uncommitted or unpushed work are skipped even under --force
 * D3: Cleanup is best-effort and idempotent (re-run is a no-op after success)
 * D4: exitCode 0 on success/no-op; cleanup warnings keep exitCode 0
 * D5: All I/O deps injected for testability
 */
import { scanOrphanWorktrees, inspectWorktreeWork } from "../worktree/orphan.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PruneResult {
  exitCode: 0 | 1;
  message?: string;
  info?: string[];
  warnings?: string[];
}

export interface PruneDeps {
  repoRoot: string;
  spawn: SpawnFn;
  worktreeManager: WorktreeManager;
  /** Override for listing known job states. Defaults to JobStateStore.list(). */
  listStates?: () => Promise<JobState[]>;
}

export interface PruneOpts {
  force: boolean;
  deps: PruneDeps;
}

// ---------------------------------------------------------------------------
// pruneOrphanWorktrees
// ---------------------------------------------------------------------------

/**
 * Detect and optionally remove orphan worktrees.
 *
 * Behavior:
 * 1. Scan for orphan worktrees using scanOrphanWorktrees.
 * 2. Run `git worktree prune` (best-effort) to clear stale refs.
 * 3. For each orphan, inspect for uncommitted/unpushed work.
 *    - hasWork → warn and skip (even under --force).
 * 4. Dry-run (force=false): list what would be removed without deleting.
 * 5. --force: remove worktree and delete local branch (best-effort).
 * 6. No orphans → success "No orphan worktrees found".
 * 7. Idempotent: a second run after successful prune finds no orphans.
 */
export async function pruneOrphanWorktrees(opts: PruneOpts): Promise<PruneResult> {
  const { force, deps } = opts;
  const { repoRoot, spawn, worktreeManager } = deps;
  const warnings: string[] = [];
  const info: string[] = [];

  // Step 1: Scan for orphans
  let orphans: Awaited<ReturnType<typeof scanOrphanWorktrees>>;
  try {
    orphans = await scanOrphanWorktrees({
      repoRoot,
      spawn,
      listStates: deps.listStates,
    });
  } catch (err: unknown) {
    return {
      exitCode: 1,
      message: `Failed to scan for orphan worktrees: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (orphans.length === 0) {
    return {
      exitCode: 0,
      message: "No orphan worktrees found",
    };
  }

  // Step 2: Best-effort git worktree prune
  try {
    await worktreeManager.prune(repoRoot);
  } catch (err: unknown) {
    warnings.push(
      `Warning: git worktree prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Steps 3–5: Process each orphan
  const deletable: typeof orphans = [];
  for (const orphan of orphans) {
    // Step 3: Inspect for work
    let inspection: Awaited<ReturnType<typeof inspectWorktreeWork>>;
    try {
      inspection = await inspectWorktreeWork(orphan.worktreePath, spawn);
    } catch (err: unknown) {
      // Fail-safe: treat as having work
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Warning: skipped ${orphan.worktreePath}: failed to inspect work state (${msg})`,
      );
      continue;
    }

    if (inspection.hasWork) {
      const reasons = inspection.reasons.join("; ");
      warnings.push(
        `Warning: skipped ${orphan.worktreePath}: ${reasons}`,
      );
      continue;
    }

    deletable.push(orphan);
  }

  if (deletable.length === 0) {
    if (orphans.length > 0) {
      // All orphans were skipped (work guard)
      return {
        exitCode: 0,
        message: `No orphan worktrees removed (${orphans.length} skipped due to unsaved work)`,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
    return {
      exitCode: 0,
      message: "No orphan worktrees found",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  if (!force) {
    // Dry-run: describe what would be removed
    for (const orphan of deletable) {
      const branchPart = orphan.branch ? ` (branch: ${orphan.branch})` : "";
      info.push(`Would remove: ${orphan.worktreePath}${branchPart}`);
    }
    return {
      exitCode: 0,
      message: `Dry-run: ${deletable.length} orphan worktree(s) would be removed. Use --force to delete.`,
      info: info.length > 0 ? info : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Step 5: --force: perform actual removal
  let removed = 0;
  for (const orphan of deletable) {
    // Remove worktree (best-effort)
    try {
      await worktreeManager.remove(orphan.worktreePath, repoRoot);
    } catch (err: unknown) {
      warnings.push(
        `Warning: failed to remove worktree at ${orphan.worktreePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue to branch deletion (best-effort)
    }

    // Delete local branch (best-effort; skip if branch is null)
    if (orphan.branch) {
      const branchResult = await spawn("git", ["branch", "-D", orphan.branch], { cwd: repoRoot });
      if (branchResult.exitCode !== 0) {
        warnings.push(
          `Warning: failed to delete local branch '${orphan.branch}': ${branchResult.stderr.trim()}`,
        );
      }
    }

    info.push(`Removed: ${orphan.worktreePath}${orphan.branch ? ` (branch: ${orphan.branch})` : ""}`);
    removed++;
  }

  return {
    exitCode: 0,
    message: `Removed ${removed} orphan worktree(s)`,
    info: info.length > 0 ? info : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
