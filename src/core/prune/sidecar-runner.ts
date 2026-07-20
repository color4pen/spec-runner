/**
 * Core logic for pruning orphan sidecar directories.
 *
 * Extends `job prune` to handle orphan sidecar directories under
 * `.specrunner/local/` in addition to orphan worktrees.
 *
 * Design:
 * D1: Default is dry-run (no deletions without --force)
 * D2: Active job sidecars are protected (scan filters them out)
 * D3: Cleanup is best-effort and idempotent (re-run is a no-op after success)
 * D4: exitCode 0 on success/no-op; cleanup warnings keep exitCode 0
 *     exitCode 1 only on hard scan failure
 * D5: All I/O deps injected for testability
 */
import { scanOrphanSidecars } from "../sidecar/orphan.js";
import type { SidecarScanFs, ScanSidecarsFn, OrphanSidecar } from "../sidecar/orphan.js";
import type { PruneResult } from "./runner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * fs port for sidecar pruning — extends SidecarScanFs with rm for deletion.
 */
export interface SidecarPruneFs extends SidecarScanFs {
  rm(path: string, opts: { recursive: boolean; force: boolean }): Promise<void>;
}

export interface SidecarPruneDeps {
  repoRoot: string;
  fs: SidecarPruneFs;
  /** Override for scan function. Defaults to scanOrphanSidecars. */
  scan?: ScanSidecarsFn;
}

export interface SidecarPruneOpts {
  force: boolean;
  deps: SidecarPruneDeps;
}

// ---------------------------------------------------------------------------
// pruneOrphanSidecars
// ---------------------------------------------------------------------------

/**
 * Detect and optionally remove orphan sidecar directories.
 *
 * Behavior:
 * 1. Scan for orphan sidecars via deps.scan ?? scanOrphanSidecars.
 *    A hard scan failure → { exitCode: 1, message: "Failed to scan for orphan sidecars: …" }.
 * 2. No orphans → { exitCode: 0, message: "No orphan sidecar directories found" }.
 * 3. Dry-run (force=false) → info lines "Would remove: <sidecarPath>" and
 *    message "Dry-run: N orphan sidecar(s) would be removed. Use --force to delete."
 *    Does NOT call fs.rm.
 * 4. --force → fs.rm(sidecarPath, { recursive: true, force: true }) for each orphan.
 *    On rejection, push a warning and continue (best-effort). Count successes.
 *    message: "Removed N orphan sidecar(s)".
 */
export async function pruneOrphanSidecars(opts: SidecarPruneOpts): Promise<PruneResult> {
  const { force, deps } = opts;
  const { repoRoot, fs } = deps;
  const doScan: ScanSidecarsFn = deps.scan ?? scanOrphanSidecars;

  // Step 1: Scan for orphans
  let orphans: OrphanSidecar[];
  try {
    orphans = await doScan({ repoRoot, fs });
  } catch (err: unknown) {
    return {
      exitCode: 1,
      message: `Failed to scan for orphan sidecars: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 2: No orphans → success
  if (orphans.length === 0) {
    return {
      exitCode: 0,
      message: "No orphan sidecar directories found",
    };
  }

  // Step 3: Dry-run
  if (!force) {
    const info: string[] = orphans.map((o) => `Would remove: ${o.sidecarPath}`);
    return {
      exitCode: 0,
      message: `Dry-run: ${orphans.length} orphan sidecar(s) would be removed. Use --force to delete.`,
      info,
    };
  }

  // Step 4: --force: perform actual removal (best-effort)
  const warnings: string[] = [];
  const info: string[] = [];
  let removed = 0;

  for (const orphan of orphans) {
    try {
      await fs.rm(orphan.sidecarPath, { recursive: true, force: true });
      info.push(`Removed: ${orphan.sidecarPath}`);
      removed++;
    } catch (err: unknown) {
      warnings.push(
        `Warning: failed to remove sidecar at ${orphan.sidecarPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    exitCode: 0,
    message: `Removed ${removed} orphan sidecar(s)`,
    info: info.length > 0 ? info : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
