/**
 * Shared logic for orphan sidecar detection.
 *
 * An orphan sidecar is a directory under `.specrunner/local/` whose
 * corresponding job state is "archived", "canceled", or missing entirely.
 * Running / awaiting-* / failed / terminated jobs are not considered orphans.
 *
 * This module is imported by:
 *   - src/core/doctor/checks/storage/orphan-sidecars.ts (read-only check)
 *   - src/core/prune/sidecar-runner.ts (cleanup command)
 */
import * as path from "node:path";
import { localSidecarBaseDirRel } from "../../util/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Non-terminal statuses — sidecars for these are not orphans. */
export const ACTIVE_STATUSES = new Set([
  "running",
  "awaiting-resume",
  "awaiting-archive",
  "failed",
  "terminated",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrphanSidecar {
  slug: string;
  /** Absolute path to .specrunner/local/<slug> */
  sidecarPath: string;
}

/**
 * Read-only fs port for sidecar scanning.
 * Designed to be a structural subset that DoctorFs satisfies.
 */
export interface SidecarScanFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  readFile(path: string, enc: "utf-8"): Promise<string>;
}

export interface ScanSidecarDeps {
  repoRoot: string;
  fs: SidecarScanFs;
}

export type ScanSidecarsFn = (deps: ScanSidecarDeps) => Promise<OrphanSidecar[]>;

// ---------------------------------------------------------------------------
// isOrphanSidecar
// ---------------------------------------------------------------------------

/**
 * Determine whether the sidecar directory for `slug` is an orphan.
 *
 * Returns true if the job is archived, canceled, or has no recoverable state.
 * Returns false if the job is active (running / awaiting-* / failed / terminated).
 */
export async function isOrphanSidecar(
  deps: ScanSidecarDeps,
  slug: string,
  sidecarDir: string,
): Promise<boolean> {
  const { repoRoot, fs } = deps;

  // Read liveness.json to get worktreePath (for fallback state.json lookup)
  let worktreePath: string | null = null;
  try {
    const livenessPath = path.join(sidecarDir, "liveness.json");
    const raw = await fs.readFile(livenessPath, "utf-8");
    const liveness = JSON.parse(raw) as Record<string, unknown>;
    if (typeof liveness["worktreePath"] === "string") {
      worktreePath = liveness["worktreePath"];
    }
  } catch {
    // No liveness.json or unreadable — proceed without worktreePath
  }

  // Check main checkout state.json
  const mainStatePath = path.join(repoRoot, "specrunner", "changes", slug, "state.json");
  try {
    const raw = await fs.readFile(mainStatePath, "utf-8");
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
        const worktreeStatePath = path.join(
          worktreePath,
          "specrunner",
          "changes",
          slug,
          "state.json",
        );
        try {
          const raw = await fs.readFile(worktreeStatePath, "utf-8");
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

// ---------------------------------------------------------------------------
// scanOrphanSidecars
// ---------------------------------------------------------------------------

/**
 * Enumerate sidecar directories under `.specrunner/local/` and return those
 * that are orphans (archived, canceled, or missing state).
 *
 * Never throws: a missing base dir or readdirSync failure returns [].
 * Results are sorted alphabetically by slug for deterministic ordering.
 */
export async function scanOrphanSidecars(deps: ScanSidecarDeps): Promise<OrphanSidecar[]> {
  const { repoRoot, fs } = deps;

  const baseDir = path.join(repoRoot, localSidecarBaseDirRel());

  // Check if base dir exists
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  // Read entries
  let entries: string[];
  try {
    entries = fs.readdirSync(baseDir);
  } catch {
    return [];
  }

  const orphans: OrphanSidecar[] = [];

  for (const entry of entries) {
    const sidecarPath = path.join(baseDir, entry);

    // Skip non-directories
    try {
      const stat = await fs.stat(sidecarPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const slug = entry;
    const orphan = await isOrphanSidecar(deps, slug, sidecarPath);
    if (orphan) {
      orphans.push({ slug, sidecarPath });
    }
  }

  // Sort by slug for deterministic ordering
  return orphans.sort((a, b) => a.slug.localeCompare(b.slug));
}
