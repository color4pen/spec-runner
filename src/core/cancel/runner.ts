/**
 * Core logic for `specrunner job cancel` command.
 *
 * Design:
 * D1: State file is preserved (audit trail) unless --purge is given
 * D2: canceledAt + error.code=USER_CANCELED written to state on cancel
 * D3: cleanup (worktree + branches) is best-effort; failures → warnings
 * D4: archived status is terminal-complete → reject
 * D5: canceled status is idempotent → cleanup only (no state mutation)
 * D6: awaiting-merge requires --force (open PR guard)
 * D7: All I/O deps injected for testability
 */

import { JobStateStore } from "../../store/job-state-store.js";
import { transitionJob } from "../../state/lifecycle.js";
import { stdoutWrite } from "../../logger/stdout.js";
import { ERROR_CODES, SpecRunnerError } from "../../errors.js";
import { gracefulKill } from "./pid-kill.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancelResult {
  exitCode: 0 | 1;
  message?: string;
  warnings?: string[];
  info?: string[];
}

export interface CancelDeps {
  spawn: SpawnFn;
  worktreeManager: WorktreeManager;
  sleep: (ms: number) => Promise<void>;
  kill: (pid: number, signal: string) => void;
  isAlive: (pid: number) => boolean;
  repoRoot: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses targeted by --all-terminated bulk cleanup (does NOT include archived). */
export const BULK_CLEANUP_STATUSES = new Set(["failed", "terminated", "canceled"]);

/** Timeout in ms for graceful kill (SIGTERM → SIGKILL escalation). */
const GRACEFUL_KILL_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort cleanup: worktree removal + local/remote branch deletion.
 * Failures append warnings but never throw.
 */
async function cleanupJobResources(
  state: JobState,
  deps: CancelDeps,
  warnings: string[],
): Promise<void> {
  const { spawn, worktreeManager, repoRoot } = deps;

  // 1. git worktree prune (orphan references)
  try {
    await worktreeManager.prune(repoRoot);
  } catch (err: unknown) {
    warnings.push(`Warning: git worktree prune failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Remove the job's worktree if path is set
  const worktreePath = state.worktreePath;
  if (worktreePath) {
    try {
      await worktreeManager.remove(worktreePath, repoRoot);
    } catch (err: unknown) {
      warnings.push(`Warning: failed to remove worktree at ${worktreePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Delete local branch (best-effort)
  const branch = state.branch;
  if (branch) {
    const localResult = await spawn("git", ["branch", "-D", branch], { cwd: repoRoot });
    if (localResult.exitCode !== 0) {
      warnings.push(`Warning: failed to delete local branch '${branch}': ${localResult.stderr.trim()}`);
    }

    // 4. Delete remote branch (best-effort)
    const remoteResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd: repoRoot });
    if (remoteResult.exitCode !== 0) {
      warnings.push(`Warning: failed to delete remote branch '${branch}': ${remoteResult.stderr.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// cancelSingleJob
// ---------------------------------------------------------------------------

/**
 * Cancel a single job.
 * Status-dispatch behavior defined in spec: job-cancel-command.
 */
export async function cancelSingleJob(opts: {
  jobId: string;
  force: boolean;
  purge: boolean;
  deps: CancelDeps;
}): Promise<CancelResult> {
  const { jobId, force, purge, deps } = opts;
  const warnings: string[] = [];

  // Load state
  let state: JobState;
  try {
    state = (await new JobStateStore(jobId, deps.repoRoot).load()) as JobState;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (
      (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FOUND) ||
      code === "ENOENT"
    ) {
      return { exitCode: 1, message: `Job not found: ${jobId}` };
    }
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Status-specific pre-checks
  // ---------------------------------------------------------------------------

  if (state.status === "archived") {
    return {
      exitCode: 1,
      message: "Job is already archived. Cannot cancel.",
    };
  }

  if (state.status === "awaiting-merge" && !force) {
    return {
      exitCode: 1,
      message: "PR is open. Use --force to cancel.",
    };
  }

  // ---------------------------------------------------------------------------
  // Process kill for running jobs
  // ---------------------------------------------------------------------------

  if (state.status === "running") {
    if (state.pid != null) {
      const killResult = await gracefulKill(state.pid, GRACEFUL_KILL_TIMEOUT_MS, {
        kill: deps.kill,
        sleep: deps.sleep,
        isAlive: deps.isAlive,
      });
      if (!killResult.killed && killResult.warning) {
        warnings.push(killResult.warning);
      }
    } else {
      warnings.push("Warning: no PID recorded for running job, skipping process kill.");
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup (best-effort)
  // ---------------------------------------------------------------------------

  await cleanupJobResources(state, deps, warnings);

  // ---------------------------------------------------------------------------
  // State update (skip for canceled — idempotent case)
  // ---------------------------------------------------------------------------

  if (state.status !== "canceled") {
    const now = new Date().toISOString();
    const { state: updated } = transitionJob(state, "canceled", {
      trigger: "cancel",
      reason: "Canceled by user",
      patch: {
        error: { code: ERROR_CODES.USER_CANCELED, message: "Canceled by user", hint: "" },
        canceledAt: now,
        worktreePath: null,
      },
    });

    if (!purge) {
      await new JobStateStore(jobId, deps.repoRoot).persist(updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Purge (state file physical deletion)
  // ---------------------------------------------------------------------------

  if (purge) {
    await JobStateStore.delete(deps.repoRoot, jobId);
  }

  return {
    exitCode: 0,
    message: `Canceled job ${jobId}`,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// cancelAllTerminated
// ---------------------------------------------------------------------------

/**
 * Bulk delete state files for all jobs in terminal status (failed/terminated/canceled).
 * Does NOT include archived (different lifecycle).
 */
export async function cancelAllTerminated(opts: {
  yes: boolean;
  repoRoot: string;
  stdin?: NodeJS.ReadableStream;
}): Promise<CancelResult> {
  const { yes, repoRoot, stdin: stdinOverride } = opts;

  const allStates = await JobStateStore.list(repoRoot);
  const targets = allStates.filter((s) => BULK_CLEANUP_STATUSES.has(s.status));

  if (targets.length === 0) {
    return { exitCode: 0, message: "No terminated jobs to remove." };
  }

  const infoMessages: string[] = [];
  infoMessages.push(`Found ${targets.length} terminated job(s) to remove.`);

  if (!yes) {
    const stdinStream = stdinOverride ?? process.stdin;
    const isTTY = (stdinStream as NodeJS.ReadStream).isTTY ?? false;
    if (!isTTY) {
      return {
        exitCode: 1,
        message: "Non-interactive mode requires --yes to bulk-delete jobs.",
      };
    }

    const confirmed = await promptConfirm(stdinStream, "Remove all? [y/N] ");
    if (!confirmed) {
      return { exitCode: 0, message: "Aborted.", info: infoMessages };
    }
  }

  let removed = 0;
  let hasErrors = false;
  const warnings: string[] = [];

  for (const state of targets) {
    try {
      await JobStateStore.delete(repoRoot, state.jobId);
      removed++;
    } catch (err: unknown) {
      hasErrors = true;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to remove ${state.jobId}: ${msg}`);
    }
  }

  infoMessages.push(`Removed ${removed} job(s).`);

  return {
    exitCode: hasErrors ? 1 : 0,
    info: infoMessages,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal: promptConfirm
// ---------------------------------------------------------------------------

/**
 * Read one line from stream and return true if answer is 'y' or 'Y'.
 * Ported from src/core/rm/runner.ts.
 */
function promptConfirm(stream: NodeJS.ReadableStream, prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    stdoutWrite(prompt);

    let answer = "";
    const onData = (chunk: Buffer | string) => {
      answer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const newlineIdx = answer.indexOf("\n");
      if (newlineIdx !== -1) {
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        const line = answer.slice(0, newlineIdx).trim();
        resolve(line === "y" || line === "Y");
      }
    };
    const onEnd = () => {
      stream.removeListener("data", onData);
      const line = answer.trim();
      resolve(line === "y" || line === "Y");
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
  });
}
