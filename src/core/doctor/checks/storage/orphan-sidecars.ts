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
 *  - Any orphan sidecar → warn (list paths + job prune hint)
 *  - Read-only: never deletes anything
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { scanOrphanSidecars } from "../../../../core/sidecar/orphan.js";
import type { ScanSidecarsFn } from "../../../../core/sidecar/orphan.js";

/** Maximum number of orphan paths to show in human-readable output. */
export const SIDECAR_DETAILS_HUMAN_LIMIT = 10;

/**
 * Factory that creates the orphan-sidecars check with an optional scan override.
 * The override is intended for testing only; production code uses the default.
 */
export function createOrphanSidecarsCheck(overrideScan?: ScanSidecarsFn): DoctorCheck {
  const doScan: ScanSidecarsFn = overrideScan ?? scanOrphanSidecars;

  return {
    name: "orphan-sidecars",
    category: "storage",
    required: false,

    async check(ctx: DoctorContext) {
      let orphans: Awaited<ReturnType<typeof scanOrphanSidecars>>;
      try {
        orphans = await doScan({ repoRoot: ctx.cwd, fs: ctx.fs });
      } catch {
        return {
          status: "pass",
          message: "No machine-local sidecar directory found",
        };
      }

      if (orphans.length === 0) {
        return {
          status: "pass",
          message: "No orphan sidecar directories found",
        };
      }

      const count = orphans.length;
      const paths = orphans.map((o) => o.sidecarPath);

      // Build human-only rounded view when count exceeds the display limit
      let detailsHuman: string[] | undefined;
      if (count > SIDECAR_DETAILS_HUMAN_LIMIT) {
        const shown = paths.slice(0, SIDECAR_DETAILS_HUMAN_LIMIT);
        const remainder = count - SIDECAR_DETAILS_HUMAN_LIMIT;
        detailsHuman = [...shown, `…and ${remainder} more`];
      }

      return {
        status: "warn",
        message: `Found ${count} orphan sidecar director${count === 1 ? "y" : "ies"} (archived/missing jobs)`,
        hint: `Remove orphan sidecars with:\n  specrunner job prune --force`,
        details: paths,
        detailsHuman,
      };
    },
  };
}

/** Default orphan-sidecars check instance (uses real scanOrphanSidecars). */
export const orphanSidecarsCheck: DoctorCheck = createOrphanSidecarsCheck();
