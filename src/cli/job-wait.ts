/**
 * `specrunner job wait <slug>` — block until a job settles.
 *
 * Uses a process-death gate to avoid false positives from the disk-lag that
 * occurs when a resume is in progress: state.json on the main checkout may
 * remain `awaiting-resume` while the pipeline is actively running in a
 * worktree.  We keep waiting as long as the runner process is alive,
 * regardless of on-disk status.  Only after the process dies do we read the
 * final status and report.
 *
 * Design: D6 / D7 in design.md.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import type { JobState, JobStatus } from "../state/schema.js";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";
import { isProcessAlive as realIsProcessAlive, isStaleRunning as realIsStaleRunning } from "../core/resume/safety.js";
import { resolveJobPid, type SidecarContent } from "../core/liveness/resolve-pid.js";
import { livenessJsonPath } from "../util/paths.js";
import { logResult, stderrWrite, logError } from "../logger/stdout.js";
import { getDetachLogPath } from "../util/xdg.js";
import { detectSpecrunnerWorktree } from "../core/worktree/detection.js";
import { worktreeGuardError } from "../errors.js";

// ---------------------------------------------------------------------------
// Dependency-injection seam
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for `runJobWait`.
 * Production code uses the real implementations; tests inject stubs.
 */
export interface JobWaitDeps {
  /**
   * Load the latest job state for the given slug.
   * Returns null when no matching job is found.
   */
  loadState: (slug: string, repoRoot: string) => Promise<JobState | null>;
  /** Probe whether the process with the given PID is alive. */
  isProcessAlive: (pid: number) => boolean;
  /** Fallback: is a running job whose PID is unknown actually stale? */
  isStaleRunning: (state: JobState) => boolean;
  /**
   * Read the pid and jobId from the liveness sidecar at the given absolute path.
   * Returns null when the sidecar is absent or unreadable.
   */
  readSidecarPid: (sidecarAbsPath: string) => SidecarContent | null;
  /** Async sleep (injected so tests run without real delays). */
  sleep: (ms: number) => Promise<void>;
  /** Polling interval in ms between liveness checks. */
  pollIntervalMs: number;
  /** How many times to retry loadState before giving up (slug not found). */
  notFoundRetryCount: number;
  /** Sleep between not-found retries in ms. */
  notFoundRetryIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Settle report helpers (D7)
// ---------------------------------------------------------------------------

/**
 * Map a settled job status to a next-action hint.
 * Exported so callers can assert on the content in output-contract tests.
 */
export function nextActionFor(status: JobStatus | "awaiting-resume"): string {
  switch (status) {
    case "awaiting-archive":
      return "next: specrunner job archive <slug>";
    case "archived":
      return "completed (already archived)";
    case "awaiting-resume":
      return "next: specrunner job resume <slug>";
    case "failed":
    case "terminated":
      return "investigate: specrunner job show <slug>";
    case "canceled":
      return "canceled — no action needed";
    default:
      return "next: specrunner job show <slug>";
  }
}

/**
 * Emit the settle report line to stdout.
 * Format: "<slug>: <status> — <nextAction>"
 */
function reportSettle(slug: string, status: string, nextAction: string): void {
  logResult(`${slug}: ${status} — ${nextAction}`);
}

/**
 * Return the exit code for a settled status.
 * awaiting-archive / archived → 0 (pipeline succeeded).
 * Everything else → 1 (pipeline stopped, needs human action).
 */
function exitCodeForStatus(status: string): number {
  return status === "awaiting-archive" || status === "archived" ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Real sidecar pid reader
// ---------------------------------------------------------------------------

export function realReadSidecarPid(sidecarAbsPath: string): SidecarContent | null {
  try {
    const raw = fs.readFileSync(sidecarAbsPath, "utf-8");
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
// Default deps (production)
// ---------------------------------------------------------------------------

function makeDefaultDeps(repoRoot: string, slug: string): JobWaitDeps {
  const sidecarRel = livenessJsonPath(slug);
  const sidecarAbs = path.join(repoRoot, sidecarRel);

  return {
    loadState: async (s: string, root: string) => {
      const all = await JobStateStore.list(root, { includeArchived: true });
      const matching = all.filter((j) => getJobSlug(j) === s);
      if (matching.length === 0) return null;
      return (
        [...matching].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null
      );
    },
    isProcessAlive: realIsProcessAlive,
    isStaleRunning: (state: JobState) => realIsStaleRunning(state, sidecarAbs),
    readSidecarPid: realReadSidecarPid,
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    pollIntervalMs: 2000,
    notFoundRetryCount: 5,
    notFoundRetryIntervalMs: 2000,
  };
}

// ---------------------------------------------------------------------------
// runJobWait
// ---------------------------------------------------------------------------

/**
 * Wait for a job to settle, then report status and return an exit code.
 *
 * @param slug      Job slug to watch.
 * @param opts.repoRoot  Absolute path to the repository root.
 * @param opts.deps      Optional injected dependencies (for testing).
 * @returns Exit code: 0 = success, 1 = stopped, 2 = slug not found / arg error.
 */
export async function runJobWait(
  slug: string,
  opts: { repoRoot: string; deps?: JobWaitDeps },
): Promise<number> {
  const repoRoot = opts.repoRoot;

  // Worktree guard: reject from inside a specrunner job worktree.
  // Matches the guard style used by job show / job ls (T-05 AC).
  const wtResult = await detectSpecrunnerWorktree(repoRoot);
  if (wtResult.isSpecrunnerWorktree) {
    const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
    const guardErr = worktreeGuardError("job wait", mainPath);
    logError(guardErr.message);
    stderrWrite(`Hint: ${guardErr.hint}`);
    return 2;
  }

  const deps: JobWaitDeps = opts.deps ?? makeDefaultDeps(repoRoot, slug);

  // Compute the sidecar path once (used for readSidecarPid).
  const sidecarAbs = path.join(repoRoot, livenessJsonPath(slug));

  // ── Not-found retry loop (D6: detach parent initialisation window) ────────
  let state: JobState | null = null;
  for (let attempt = 0; attempt < deps.notFoundRetryCount; attempt++) {
    state = await deps.loadState(slug, repoRoot);
    if (state !== null) break;
    if (attempt < deps.notFoundRetryCount - 1) {
      await deps.sleep(deps.notFoundRetryIntervalMs);
    }
  }

  if (state === null) {
    stderrWrite(`Error: No job found for slug: ${slug}`);
    stderrWrite(`Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: ${getDetachLogPath(repoRoot, slug)}`);
    return 2;
  }

  // ── Poll loop (process-death gate, D6) ───────────────────────────────────
  // Track the last known pid across iterations so that when state.pid becomes
  // null (e.g. the process died before clearing the disk state), we can still
  // probe the pid we observed in a previous tick.
  let lastKnownPid: number | null = null;

  for (;;) {
    // Reload state on every tick for the freshest on-disk view.
    const currentState = await deps.loadState(slug, repoRoot);
    if (currentState === null) {
      // Job disappeared (archived/pruned mid-wait) — treat as settled.
      break;
    }

    // Resolve current pid: state.pid → sidecar (jobId-matched) → last known.
    const statePid =
      currentState.pid !== undefined && currentState.pid !== null
        ? currentState.pid
        : null;
    const sidecarRecord = statePid === null ? deps.readSidecarPid(sidecarAbs) : null;
    const sidecarPid = sidecarRecord !== null
      ? resolveJobPid({ statePid: null, sidecar: sidecarRecord, expectedJobId: currentState.jobId }).pid
      : null;
    const resolvedPid: number | null = statePid ?? sidecarPid ?? lastKnownPid;

    // Update the last-known pid for the next iteration.
    if (resolvedPid !== null) lastKnownPid = resolvedPid;

    if (resolvedPid !== null) {
      // ── PID-gated path ─────────────────────────────────────────────────
      if (deps.isProcessAlive(resolvedPid)) {
        // Process is still alive — keep waiting regardless of on-disk status.
        await deps.sleep(deps.pollIntervalMs);
        continue;
      }

      // Process is dead.  Reload state one more time to capture any final
      // transitions the process wrote before exiting.
      const freshState = (await deps.loadState(slug, repoRoot)) ?? currentState;
      let finalStatus: string = freshState.status;

      // If the process died without transitioning (crash / SIGKILL), treat
      // the running status as awaiting-resume (consistent with the normal
      // SIGTERM → beforeExit → awaiting-resume path).
      if (finalStatus === "running") {
        finalStatus = "awaiting-resume";
      }

      reportSettle(slug, finalStatus, nextActionFor(finalStatus as JobStatus));
      return exitCodeForStatus(finalStatus);
    }

    // ── No-PID path (backward-compat state) ────────────────────────────
    if (currentState.status !== "running") {
      // Non-running and no pid → already settled.
      reportSettle(
        slug,
        currentState.status,
        nextActionFor(currentState.status as JobStatus),
      );
      return exitCodeForStatus(currentState.status);
    }

    // Status is "running" but no pid: use isStaleRunning fallback.
    if (deps.isStaleRunning(currentState)) {
      // Stale running → treat as awaiting-resume.
      reportSettle(slug, "awaiting-resume", nextActionFor("awaiting-resume"));
      return 1;
    }

    // Not yet stale — keep polling.
    await deps.sleep(deps.pollIntervalMs);
  }

  // Job disappeared mid-wait — report as an anomaly.
  stderrWrite(`Warning: job ${slug} disappeared during wait.`);
  return 1;
}
