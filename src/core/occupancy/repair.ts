/**
 * repairSlugOccupancySidecar: mechanical sidecar repair for the doctor repair command.
 *
 * When a slug has exactly one non-terminal job but the liveness sidecar points
 * elsewhere (terminal/absent), re-points the sidecar to the correct job.
 *
 * Cases:
 *   ≥2 non-terminal → refuse with SLUG_OCCUPANCY_AMBIGUOUS
 *   0 non-terminal → no-op (nothing to repair)
 *   1 non-terminal + sidecar already correct → no-op
 *   1 non-terminal + sidecar wrong/absent → re-point via claimSidecar
 *
 * The slug argument is validated against SLUG_REGEX before any I/O.
 */
import { scanSlugOccupancy } from "./scan.js";
import type { OccupancyScanResult } from "./scan.js";
import { slugOccupancyAmbiguousError, SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { SLUG_REGEX } from "../../util/validation-patterns.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepairSlugOccupancySidecarDeps {
  scanOccupancy?: (repoRoot: string, slug: string) => Promise<OccupancyScanResult>;
  /** Read the current sidecar's jobId; return null if absent. */
  readSidecarJobId?: (repoRoot: string, slug: string) => Promise<string | null>;
  /** Re-point the sidecar to the given record. */
  claimSidecar?: (record: { jobId: string; worktreePath: string | null; pid: null; session: null }) => Promise<void>;
}

export interface RepairResult {
  message: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Repair the liveness sidecar for a slug if exactly one non-terminal job exists
 * and the sidecar is mismatched. Returns a result with a descriptive message.
 */
export async function repairSlugOccupancySidecar(
  repoRoot: string,
  slug: string,
  deps?: RepairSlugOccupancySidecarDeps,
): Promise<RepairResult> {
  // Validate slug before any I/O
  if (!SLUG_REGEX.test(slug)) {
    throw new SpecRunnerError(
      ERROR_CODES.REQUEST_MD_INVALID,
      `Slug must match /^[a-z0-9][a-z0-9-]{0,63}$/`,
      `Invalid slug '${slug}': does not match SLUG_REGEX.`,
    );
  }

  const scanOccupancy = deps?.scanOccupancy ?? ((r: string, s: string) => scanSlugOccupancy(r, s));

  const scanResult = await scanOccupancy(repoRoot, slug);
  const { nonTerminal } = scanResult;

  // ≥2 non-terminal → ambiguous, refuse
  if (nonTerminal.length >= 2) {
    throw slugOccupancyAmbiguousError(slug, nonTerminal);
  }

  // 0 non-terminal → nothing to repair
  if (nonTerminal.length === 0) {
    return { message: `No non-terminal job found for slug '${slug}'; nothing to repair.` };
  }

  // Exactly 1 non-terminal — check if sidecar already points to it
  const targetJob = nonTerminal[0]!;

  const readSidecarJobId = deps?.readSidecarJobId ?? defaultReadSidecarJobId;
  const currentSidecarJobId = await readSidecarJobId(repoRoot, slug);

  if (currentSidecarJobId === targetJob.jobId) {
    return {
      message: `Sidecar for slug '${slug}' already points to the correct job (${targetJob.jobId}); no repair needed.`,
    };
  }

  // Sidecar is mismatched → re-point via claimSidecar
  const claimSidecar = deps?.claimSidecar ?? defaultClaimSidecar(repoRoot, slug);
  await claimSidecar({
    jobId: targetJob.jobId,
    worktreePath: targetJob.worktreePath,
    pid: null,
    session: null,
  });

  return {
    message: `Sidecar for slug '${slug}' re-pointed from '${currentSidecarJobId ?? "(absent)"}' to '${targetJob.jobId}' (status: ${targetJob.status}).`,
  };
}

// ---------------------------------------------------------------------------
// Default dep implementations (used when deps is not injected)
// ---------------------------------------------------------------------------

async function defaultReadSidecarJobId(repoRoot: string, slug: string): Promise<string | null> {
  const { livenessJsonPath } = await import("../../util/paths.js");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  try {
    const raw = await fs.readFile(path.join(repoRoot, livenessJsonPath(slug)), "utf-8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return typeof obj["jobId"] === "string" ? obj["jobId"] : null;
  } catch {
    return null;
  }
}

function defaultClaimSidecar(
  repoRoot: string,
  slug: string,
): (record: { jobId: string; worktreePath: string | null; pid: null; session: null }) => Promise<void> {
  return async (record) => {
    const { claimLivenessSidecar } = await import("./claim.js");
    const { livenessJsonPath } = await import("../../util/paths.js");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    await claimLivenessSidecar(repoRoot, slug, record, {
      readSidecar: async (r, s) => {
        try {
          const raw = await fs.readFile(path.join(r, livenessJsonPath(s)), "utf-8");
          const obj = JSON.parse(raw) as Record<string, unknown>;
          return typeof obj["jobId"] === "string" ? { jobId: obj["jobId"] as string } : null;
        } catch {
          return null;
        }
      },
      getJobStatus: async (r, _s, jobId) => {
        const { JobStateStore } = await import("../../store/job-state-store.js");
        const states = await JobStateStore.list(r);
        const match = states.find((st) => st.jobId === jobId);
        return match?.status ?? null;
      },
      writeSidecar: async (r, s, rec) => {
        const sidecarPath = path.join(r, livenessJsonPath(s));
        await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
        await fs.writeFile(sidecarPath, JSON.stringify(rec), "utf-8");
      },
    });
  };
}
