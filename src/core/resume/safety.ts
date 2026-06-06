import * as fs from "node:fs";
import type { JobState } from "../../state/schema.js";

/**
 * Check if a process with the given PID is alive.
 *
 * Uses `process.kill(pid, 0)` as a probe (sends no signal):
 * - No exception → process exists → true
 * - EPERM → process exists but we lack permission → true (not stale)
 * - ESRCH → process not found → false (stale)
 * - Other errors → false (safe-side: treat as stale)
 */
export function isProcessAlive(pid: number): boolean {
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

const STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Determine if a "running" job state is orphaned (the runner process is dead).
 *
 * Returns false for any non-"running" status.
 * PID resolution order (highest priority first):
 *   1. state.pid (direct PID in state) — unchanged from Stage 1
 *   2. sidecarPath (liveness sidecar, T-13): used when state.pid is absent
 *      - sidecar missing → stale (CI fresh checkout with no running process)
 *      - sidecar present, pid → probe liveness
 *      - sidecar present, no pid → stale
 *   3. Fallback: updatedAt age threshold (15 min)
 */
export function isStaleRunning(state: JobState, sidecarPath?: string): boolean {
  if (state.status !== "running") return false;

  // Priority 1: pid in state (backward compat, Stage 1 behavior)
  if (state.pid != null) {
    return !isProcessAlive(state.pid);
  }

  // Priority 2: pid from liveness sidecar (slug mode, T-13)
  if (sidecarPath) {
    try {
      const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) as Record<string, unknown>;
      const pid = sidecar["pid"];
      if (pid != null && typeof pid === "number") {
        return !isProcessAlive(pid);
      }
      // Sidecar present but no pid field → treat as stale
      return true;
    } catch {
      // Sidecar missing or unreadable → stale (CI fresh checkout)
      return true;
    }
  }

  // Priority 3: fallback: no PID anywhere (legacy state file)
  const elapsed = Date.now() - new Date(state.updatedAt).getTime();
  return elapsed > STALE_RUNNING_THRESHOLD_MS;
}

/**
 * Check whether a step has escalated consecutively N or more times.
 *
 * Scans the tail of state.steps[stepName], up to `threshold` entries.
 * Returns true if all of those entries have verdict "escalation" or "error".
 *
 * Design D4: threshold defaults to 3. --force overrides this check.
 *
 * @param state - current job state
 * @param stepName - the step to inspect
 * @param threshold - number of consecutive escalations required to trigger (default 3)
 */
export function checkConsecutiveEscalations(
  state: JobState,
  stepName: string,
  threshold = 3,
): boolean {
  const runs = state.steps?.[stepName];
  if (!runs || runs.length === 0) {
    return false;
  }

  // Take the last `threshold` entries
  const tail = runs.slice(-threshold);

  // We only block if we actually have `threshold` entries and all are escalation/error
  if (tail.length < threshold) {
    return false;
  }

  return tail.every((run) => {
    const verdict = run.outcome?.verdict;
    return verdict === "escalation" || verdict === "error";
  });
}

/**
 * Check whether the job state is stale (updatedAt older than thresholdMs).
 *
 * Design D6: default threshold is 24 hours (86400000 ms). Warning only — does not block.
 *
 * @param state - current job state
 * @param thresholdMs - age threshold in milliseconds (default 24 hours)
 */
export function checkStaleState(
  state: JobState,
  thresholdMs = 86400000,
): boolean {
  const updatedAt = new Date(state.updatedAt).getTime();
  return Date.now() - updatedAt > thresholdMs;
}
