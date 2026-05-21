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
import { cancelSingleJob, cancelAllTerminated } from "../core/cancel/runner.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { spawnCommand } from "../util/spawn.js";

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
    process.stderr.write("Error: specrunner job cancel requires a <jobId> or --all-terminated.\n");
    return 2;
  }
  if (allTerminated && jobId) {
    process.stderr.write("Error: --all-terminated cannot be combined with a <jobId> argument.\n");
    return 2;
  }
  if (purge && allTerminated) {
    process.stderr.write("Error: --purge cannot be combined with --all-terminated (bulk cleanup always removes state files).\n");
    return 2;
  }

  // --all-terminated bulk cleanup
  if (allTerminated) {
    const result = await cancelAllTerminated({ yes });
    writeResult(result);
    return result.exitCode;
  }

  // Resolve short job ID to full UUID
  let resolvedJobId: string;
  try {
    resolvedJobId = await JobStateStore.resolveId(jobId!);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  // Resolve repo root
  let repoRoot: string;
  try {
    const result = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    if (result.exitCode !== 0) {
      process.stderr.write(`Error: failed to resolve git repo root: ${result.stderr.trim()}\n`);
      return 1;
    }
    repoRoot = result.stdout.trim();
  } catch (err: unknown) {
    process.stderr.write(`Error: failed to resolve git repo root: ${(err as Error).message}\n`);
    return 1;
  }

  const worktreeManager = createWorktreeManager();

  const result = await cancelSingleJob({
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

  writeResult(result);
  return result.exitCode;
}

/**
 * Write all runner result messages to stdout/stderr.
 * info[] → stdout, warnings[] → stderr, message → stdout (success) or stderr (error).
 */
function writeResult(result: { exitCode: number; message?: string; warnings?: string[]; info?: string[] }): void {
  for (const msg of result.info ?? []) {
    process.stdout.write(`${msg}\n`);
  }
  for (const warn of result.warnings ?? []) {
    process.stderr.write(`${warn}\n`);
  }
  if (result.message) {
    if (result.exitCode === 0) {
      process.stdout.write(`${result.message}\n`);
    } else {
      process.stderr.write(`Error: ${result.message}\n`);
    }
  }
}
