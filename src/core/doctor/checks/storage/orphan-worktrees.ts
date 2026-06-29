/**
 * Detect orphan worktrees under .git/specrunner-worktrees/.
 *
 * An orphan worktree is a worktree directory that does NOT correspond to any
 * non-terminal job state (running / awaiting-resume / awaiting-archive / failed /
 * terminated). This typically happens when a process dies after `git worktree add`
 * but before the job state is persisted.
 *
 * Design:
 *  - No specrunner-worktrees dir or no orphans → pass
 *  - Any orphan worktree → warn (list paths + prune hint)
 *  - Read-only: never deletes anything
 *  - Errors during scanning resolve to pass (do not change doctor exit-code semantics)
 */
import { spawnCommand } from "../../../../util/spawn.js";
import { scanOrphanWorktrees } from "../../../worktree/orphan.js";
import type { DoctorCheck, DoctorContext } from "../../types.js";
import type { OrphanWorktree } from "../../../worktree/orphan.js";

/** Scan function signature for dependency injection in tests. */
export type ScanFn = (deps: { repoRoot: string; spawn: typeof spawnCommand }) => Promise<OrphanWorktree[]>;

/**
 * Factory that creates the orphan-worktrees check with an optional scan override.
 * The override is intended for testing only; production code uses the default.
 */
export function createOrphanWorktreesCheck(overrideScan?: ScanFn): DoctorCheck {
  const doScan: ScanFn = overrideScan ?? scanOrphanWorktrees;

  return {
    name: "orphan-worktrees",
    category: "storage",
    required: false,

    async check(ctx: DoctorContext) {
      let orphans: OrphanWorktree[];
      try {
        orphans = await doScan({
          repoRoot: ctx.cwd,
          spawn: spawnCommand,
        });
      } catch {
        // Defensive: scan errors must not affect doctor exit code
        return {
          status: "pass",
          message: "No orphan worktrees found",
        };
      }

      if (orphans.length === 0) {
        return {
          status: "pass",
          message: "No orphan worktrees found",
        };
      }

      const count = orphans.length;
      const paths = orphans.map((o) => o.worktreePath);

      return {
        status: "warn",
        message: `Found ${count} orphan worktree(s) with no associated job state`,
        details: paths,
        hint: "Remove orphan worktrees with:\n  specrunner job prune --force",
      };
    },
  };
}

/** Default orphan-worktrees check instance (uses real scanOrphanWorktrees). */
export const orphanWorktreesCheck: DoctorCheck = createOrphanWorktreesCheck();
