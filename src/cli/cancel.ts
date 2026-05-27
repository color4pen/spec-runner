/**
 * CLI entry point for `specrunner job cancel`.
 *
 * Exit codes: 0 (success), 1 (execution error), 2 (arg error).
 *
 * Usage:
 *   specrunner job cancel <jobId> [--force] [--purge]
 *   specrunner job cancel --all-terminated [--yes]
 */
import { JobStateStore } from "../store/job-state-store.js";
import { SpecRunnerError } from "../errors.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { cancelSingleJob, cancelAllTerminated } from "../core/cancel/runner.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { spawnCommand } from "../util/spawn.js";
import { resolveRepoRootOrFail } from "../util/repo-root.js";
import { initPipelineLog, logPipelineEvent, closePipelineLog } from "../logger/pipeline-logger.js";

export interface RunCancelOptions {
  jobId?: string;
  force: boolean;
  purge: boolean;
  allTerminated: boolean;
  yes: boolean;
}

/**
 * Run the cancel command.
 * Returns exit code: 0 (success), 1 (error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runCancel(opts: RunCancelOptions): Promise<number> {
  const { jobId, force, purge, allTerminated, yes } = opts;

  // Arg validation: exclusivity checks
  if (!allTerminated && !jobId) {
    logError("specrunner job cancel requires a <jobId> or --all-terminated.");
    return 2;
  }
  if (allTerminated && jobId) {
    logError("--all-terminated cannot be combined with a <jobId> argument.");
    return 2;
  }
  if (purge && allTerminated) {
    logError("--purge cannot be combined with --all-terminated (bulk cleanup always removes state files).");
    return 2;
  }

  // State-modifying command — require valid git repo (fail-fast)
  let repoRoot: string;
  try {
    repoRoot = await resolveRepoRootOrFail();
  } catch (err: unknown) {
    logError((err as Error).message);
    return 1;
  }

  // --all-terminated bulk cleanup
  if (allTerminated) {
    const result = await cancelAllTerminated({ yes, repoRoot });
    writeResult(result);
    return result.exitCode;
  }

  // Resolve short job ID to full UUID
  let resolvedJobId: string;
  try {
    resolvedJobId = await JobStateStore.resolveId(repoRoot, jobId!);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      if (err.hint) stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError((err as Error).message);
    }
    return 1;
  }

  const worktreeManager = createWorktreeManager();

  // Initialize pipeline log for the resolved job
  initPipelineLog(repoRoot, resolvedJobId);
  logPipelineEvent({ type: "cancel:start", jobId: resolvedJobId });

  let result;
  try {
    result = await cancelSingleJob({
      jobId: resolvedJobId,
      force,
      purge,
      deps: {
        spawn: spawnCommand,
        worktreeManager,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        kill: (pid, signal) => process.kill(pid, signal as NodeJS.Signals),
        isAlive: (pid) => {
          process.kill(pid, 0);
          return true;
        },
        repoRoot,
      },
    });
    logPipelineEvent({ type: "cancel:complete", jobId: resolvedJobId, exitCode: result.exitCode });
  } catch (err) {
    logPipelineEvent({ type: "cancel:error", jobId: resolvedJobId, error: (err as Error).message });
    throw err;
  } finally {
    closePipelineLog();
  }

  writeResult(result);
  return result.exitCode;
}

/**
 * Write all runner result messages to stdout/stderr.
 * info[] → stdout, warnings[] → stderr, message → stdout (success) or stderr (error).
 */
function writeResult(result: { exitCode: number; message?: string; warnings?: string[]; info?: string[] }): void {
  for (const msg of result.info ?? []) {
    logResult(msg);
  }
  for (const warn of result.warnings ?? []) {
    stderrWrite(warn);
  }
  if (result.message) {
    if (result.exitCode === 0) {
      logResult(result.message);
    } else {
      logError(result.message);
    }
  }
}
