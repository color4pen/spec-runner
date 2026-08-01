/**
 * assertSlugUnoccupied: pre-start guard that enforces the slug occupancy invariant.
 *
 * Reads the occupancy scan; rejects if:
 *   - slug state is unreadable → SLUG_STATE_UNREADABLE (fail-closed)
 *   - any non-terminal prior job exists → SLUG_OCCUPIED
 *
 * Resolves without throwing when the slug is free (zero non-terminal jobs).
 *
 * Design:
 * D1: state-based (not pid-based) — dead-pid occupant still blocks
 * D4: fail-closed — unreadable state refuses start
 * D5: naming "assertNoDuplicateLiveJob" kept in runtimes to bound port churn
 */
import { scanSlugOccupancy } from "./scan.js";
import type { OccupancyScanResult } from "./scan.js";
import { slugOccupiedError, slugStateUnreadableError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssertSlugUnoccupiedDeps {
  scanOccupancy: (repoRoot: string, slug: string) => Promise<OccupancyScanResult>;
  isAlive: (pid: number | null) => boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Assert that no non-terminal job occupies the slug.
 * Throws SLUG_STATE_UNREADABLE (fail-closed) or SLUG_OCCUPIED as appropriate.
 * Resolves without throwing when the slug is free.
 */
export async function assertSlugUnoccupied(
  repoRoot: string,
  slug: string,
  deps?: AssertSlugUnoccupiedDeps,
): Promise<void> {
  const scan = deps?.scanOccupancy ?? ((r: string, s: string) => scanSlugOccupancy(r, s));

  const result = await scan(repoRoot, slug);

  // Fail-closed: unreadable state is unknown state → refuse start
  if (result.unreadable !== null) {
    throw slugStateUnreadableError(slug, result.unreadable);
  }

  // If any non-terminal occupant exists → block start
  if (result.nonTerminal.length >= 1) {
    const prior = result.nonTerminal[0]!;
    throw slugOccupiedError(slug, prior);
  }
}
