/**
 * Shared pid resolver for cancel and wait paths.
 *
 * D1 (design.md): resolve kill-target pid via state.pid → liveness sidecar (jobId-matched).
 * The sidecar pid is adopted ONLY when its jobId matches the expected jobId — prevents
 * killing a different job that reclaimed the slug.
 *
 * Pure resolver is fs-free and unit-testable without any I/O.
 */

import * as fs from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidecarContent {
  pid: number | null;
  jobId?: string | null;
}

// ---------------------------------------------------------------------------
// readLivenessSidecar
// ---------------------------------------------------------------------------

/**
 * Read the liveness sidecar at `sidecarAbsPath` and return its pid/jobId fields.
 * Returns null when the file is absent or unparseable.
 */
export async function readLivenessSidecar(
  sidecarAbsPath: string,
): Promise<SidecarContent | null> {
  try {
    const raw = await fs.readFile(sidecarAbsPath, "utf-8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      pid: typeof obj["pid"] === "number" ? obj["pid"] : null,
      jobId: typeof obj["jobId"] === "string" ? obj["jobId"] : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// resolveJobPid
// ---------------------------------------------------------------------------

export interface ResolveJobPidOptions {
  statePid: number | null | undefined;
  sidecar: SidecarContent | null | undefined;
  expectedJobId: string;
}

export interface ResolvedPid {
  pid: number | null;
  source: "state" | "sidecar" | null;
}

/**
 * Pure: resolve the kill-target pid from state.pid or a jobId-matched sidecar.
 *
 * Priority:
 *   1. statePid (non-null) → { pid: statePid, source: "state" }
 *   2. sidecar.pid (non-null) AND sidecar.jobId === expectedJobId → { pid, source: "sidecar" }
 *   3. Otherwise → { pid: null, source: null }
 */
export function resolveJobPid(opts: ResolveJobPidOptions): ResolvedPid {
  const { statePid, sidecar, expectedJobId } = opts;

  if (statePid != null) {
    return { pid: statePid, source: "state" };
  }

  if (sidecar && sidecar.pid != null && sidecar.jobId === expectedJobId) {
    return { pid: sidecar.pid, source: "sidecar" };
  }

  return { pid: null, source: null };
}
