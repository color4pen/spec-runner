/**
 * Reconciliation module — detects external state drift and computes corrective transitions.
 *
 * Design decisions (design.md):
 * D1: Both functions are pure (no I/O). Callers persist the result if needed.
 * D2: isStaleRunning logic is inlined here (not imported from core/resume/safety.ts)
 *     to avoid a state → core module-boundary violation.
 * D5: reconcilePrState is display-only signal; persistence is caller's responsibility.
 */

import { transitionJob } from "./lifecycle.js";
import type { JobState } from "./schema.js";
import type { TransitionResult } from "./lifecycle.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Jobs with status "running" but not updated for this long are considered stale. */
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Check if a process with the given PID is alive.
 *
 * Uses `process.kill(pid, 0)` as a probe (sends no signal):
 * - No exception → process exists → true
 * - EPERM → process exists but we lack permission → true (not stale)
 * - ESRCH → process not found → false (stale)
 * - Other errors → false (safe-side: treat as stale)
 *
 * Inlined from src/core/resume/safety.ts to avoid state → core import direction.
 */
function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") {
      return true; // process exists but no permission
    }
    return false; // ESRCH or other error → stale
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Reconcile a stale "running" job.
 *
 * Returns a TransitionResult (running → awaiting-resume) if the job is stale,
 * or null if the job is healthy or not in "running" status.
 *
 * Stale detection:
 * - If pid is recorded: process is dead (isProcessAlive returns false)
 * - If no pid: updatedAt is older than STALE_THRESHOLD_MS (15 minutes)
 */
export function reconcileStaleRunning(state: JobState): TransitionResult | null {
  if (state.status !== "running") return null;

  const isStale = state.pid != null
    ? !isProcessAlive(state.pid)
    : (Date.now() - new Date(state.updatedAt).getTime()) > STALE_THRESHOLD_MS;

  if (!isStale) return null;

  return transitionJob(state, "awaiting-resume", {
    trigger: "reconcile",
    reason: "stale running detected",
  });
}

/**
 * Reconcile a PR-merged "awaiting-merge" job.
 *
 * Returns a TransitionResult (awaiting-merge → archived) if the job is in
 * "awaiting-merge" status and the PR has been merged externally.
 * Returns null otherwise.
 */
export function reconcilePrState(
  state: JobState,
  prStatus: "MERGED" | "CLOSED" | "OPEN",
): TransitionResult | null {
  if (state.status !== "awaiting-merge") return null;
  if (prStatus !== "MERGED") return null;

  return transitionJob(state, "archived", {
    trigger: "reconcile",
    reason: "PR merged externally",
  });
}
