/**
 * Detect orphan sidecar directories under .specrunner/local/.
 *
 * An orphan sidecar is a slug directory whose corresponding job state is
 * "archived", "canceled", or missing entirely. Running / awaiting-* / failed /
 * terminated jobs are not considered orphans.
 *
 * Design:
 *  - No sidecars → pass
 *  - All sidecars have active jobs → pass
 *  - Any orphan sidecar → warn (list paths + rm hint)
 *  - Read-only: never deletes anything
 */
import * as path from "node:path";
import type { DoctorCheck, DoctorContext } from "../../types.js";

/** Non-terminal statuses — sidecars for these are not orphans. */
const ACTIVE_STATUSES = new Set(["running", "awaiting-resume", "awaiting-archive", "failed", "terminated"]);

/**
 * Determine whether the sidecar directory for `slug` is an orphan.
 *
 * Returns true if the job is archived, canceled, or has no recoverable state.
 * Returns false if the job is active (running / awaiting-* / failed / terminated).
 */
async function isOrphanSidecar(ctx: DoctorContext, slug: string, sidecarDir: string): Promise<boolean> {
  // Read liveness.json to get worktreePath (for fallback state.json lookup)
  let worktreePath: string | null = null;
  try {
    const livenessPath = path.join(sidecarDir, "liveness.json");
    const raw = await ctx.fs.readFile(livenessPath, "utf-8");
    const liveness = JSON.parse(raw) as Record<string, unknown>;
    if (typeof liveness["worktreePath"] === "string") {
      worktreePath = liveness["worktreePath"];
    }
  } catch {
    // No liveness.json or unreadable — proceed without worktreePath
  }

  // Check main checkout state.json
  const mainStatePath = path.join(ctx.cwd, "specrunner", "changes", slug, "state.json");
  try {
    const raw = await ctx.fs.readFile(mainStatePath, "utf-8");
    const state = JSON.parse(raw) as Record<string, unknown>;
    const status = state["status"] as string | undefined;

    if (!status) return false; // JSON present but no status — skip

    if (ACTIVE_STATUSES.has(status)) return false; // active job, not an orphan
    if (status === "archived" || status === "canceled") return true; // definitively orphan

    return false; // unknown status — skip
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      // Main state.json not found — try worktree copy
      if (worktreePath) {
        const worktreeStatePath = path.join(worktreePath, "specrunner", "changes", slug, "state.json");
        try {
          const raw = await ctx.fs.readFile(worktreeStatePath, "utf-8");
          const state = JSON.parse(raw) as Record<string, unknown>;
          const status = state["status"] as string | undefined;

          if (status && ACTIVE_STATUSES.has(status)) return false; // active job in worktree
        } catch {
          // Worktree state.json also missing or unreadable
        }
      }
      // No state found anywhere → treat as orphan
      return true;
    }

    // JSON parse error or other I/O error — skip (don't treat as orphan)
    return false;
  }
}

export const orphanSidecarsCheck: DoctorCheck = {
  name: "orphan-sidecars",
  category: "storage",
  required: false,

  async check(ctx: DoctorContext) {
    const localBase = path.join(ctx.cwd, ".specrunner", "local");

    if (!ctx.fs.existsSync(localBase)) {
      return {
        status: "pass",
        message: "No machine-local sidecar directory found",
      };
    }

    let entries: string[];
    try {
      entries = ctx.fs.readdirSync(localBase);
    } catch {
      return {
        status: "pass",
        message: "No machine-local sidecar directory found",
      };
    }

    const orphans: string[] = [];

    for (const entry of entries) {
      const sidecarDir = path.join(localBase, entry);

      // Skip non-directories
      try {
        const stat = await ctx.fs.stat(sidecarDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const slug = entry;
      const orphan = await isOrphanSidecar(ctx, slug, sidecarDir);
      if (orphan) {
        orphans.push(sidecarDir);
      }
    }

    if (orphans.length === 0) {
      return {
        status: "pass",
        message: "No orphan sidecar directories found",
      };
    }

    const count = orphans.length;
    const rmCommand = `rm -rf ${orphans.map((p) => `"${p}"`).join(" ")}`;

    return {
      status: "warn",
      message: `Found ${count} orphan sidecar director${count === 1 ? "y" : "ies"} (archived/missing jobs)`,
      hint: `Remove orphan sidecars with:\n  ${rmCommand}`,
      details: orphans,
    };
  },
};
