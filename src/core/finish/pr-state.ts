/**
 * PR state detection for finish command.
 * Maps gh pr view output to 6 normalized PR states.
 *
 * TC-007 through TC-014: normalizePrState tests.
 */
import type { NormalizedPrState } from "./types.js";
import type { SpawnFn } from "../../util/spawn.js";

/**
 * Shape of gh pr view --json output.
 */
export interface GhPrViewOutput {
  state: string;
  mergeStateStatus?: string;
  statusCheckRollup?: Array<{ conclusion: string | null }>;
  headRefName?: string;
}

/**
 * Normalize gh pr view JSON output to one of 6 canonical PR states.
 * Safe defaults: unknown mergeStateStatus → OPEN_CHECKS_FAILING.
 *
 * TC-007: OPEN + CLEAN → OPEN_MERGEABLE
 * TC-008: OPEN + BEHIND → OPEN_BEHIND
 * TC-009: OPEN + DIRTY → OPEN_CONFLICTS
 * TC-010: OPEN + BLOCKED → OPEN_CHECKS_FAILING
 * TC-011: OPEN + CLEAN + checks failing → OPEN_CHECKS_FAILING
 * TC-012: MERGED → MERGED
 * TC-013: CLOSED → CLOSED
 * TC-014: OPEN + unknown mergeStateStatus → OPEN_CHECKS_FAILING
 */
export function normalizePrState(ghOutput: GhPrViewOutput): NormalizedPrState {
  const state = (ghOutput.state ?? "").toUpperCase();

  if (state === "MERGED") return "MERGED";
  if (state === "CLOSED") return "CLOSED";

  // state === "OPEN" (or anything else — treat as OPEN for safety)
  const mergeStatus = (ghOutput.mergeStateStatus ?? "").toUpperCase();

  // Check statusCheckRollup for failures first (CLEAN override)
  const hasCheckFailure = (ghOutput.statusCheckRollup ?? []).some(
    (check) =>
      check.conclusion !== null &&
      check.conclusion.toUpperCase() === "FAILURE",
  );

  if (mergeStatus === "CLEAN") {
    // Even if CLEAN, check rollup failures override to OPEN_CHECKS_FAILING
    if (hasCheckFailure) return "OPEN_CHECKS_FAILING";
    return "OPEN_MERGEABLE";
  }

  if (mergeStatus === "BEHIND") return "OPEN_BEHIND";
  if (mergeStatus === "DIRTY") return "OPEN_CONFLICTS";

  // BLOCKED, HAS_HOOKS, UNSTABLE, UNKNOWN, or any future values → OPEN_CHECKS_FAILING
  return "OPEN_CHECKS_FAILING";
}

/**
 * Fetch PR state via gh pr view subprocess.
 */
export async function fetchPrState(
  prNumber: number,
  cwd: string,
  spawn: SpawnFn,
): Promise<{ ok: true; normalized: NormalizedPrState; raw: GhPrViewOutput } | { ok: false; stderr: string }> {
  const result = await spawn(
    "gh",
    [
      "pr", "view", String(prNumber),
      "--json", "state,mergeStateStatus,statusCheckRollup,headRefName",
    ],
    { cwd },
  );

  if (result.exitCode !== 0) {
    return { ok: false, stderr: result.stderr };
  }

  let raw: GhPrViewOutput;
  try {
    raw = JSON.parse(result.stdout.trim()) as GhPrViewOutput;
  } catch {
    return { ok: false, stderr: `Failed to parse gh pr view output: ${result.stdout}` };
  }

  return { ok: true, normalized: normalizePrState(raw), raw };
}
