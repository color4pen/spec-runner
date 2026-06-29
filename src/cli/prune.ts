/**
 * CLI entry point for `specrunner job prune`.
 *
 * Exit codes: 0 (success / dry-run), 1 (execution error), 2 (arg error).
 *
 * Usage:
 *   specrunner job prune           # dry-run: list orphan worktrees without deleting
 *   specrunner job prune --force   # delete orphan worktrees and their local branches
 */
import { SpecRunnerError } from "../errors.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { pruneOrphanWorktrees } from "../core/prune/runner.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { spawnCommand } from "../util/spawn.js";
import { resolveRepoRootOrFail } from "../util/repo-root.js";

export interface RunPruneOptions {
  force: boolean;
}

/**
 * Run the prune command.
 * Returns exit code: 0 (success), 1 (error).
 * Caller (command-registry.ts) is responsible for process.exit().
 */
export async function runPrune(opts: RunPruneOptions): Promise<number> {
  const { force } = opts;

  let repoRoot: string;
  try {
    repoRoot = await resolveRepoRootOrFail();
  } catch (err: unknown) {
    logError((err as Error).message);
    return 1;
  }

  const worktreeManager = createWorktreeManager();

  let result;
  try {
    result = await pruneOrphanWorktrees({
      force,
      deps: {
        repoRoot,
        spawn: spawnCommand,
        worktreeManager,
      },
    });
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      stderrWrite(`Error: ${err.message}`);
      if (err.hint) stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  writeResult(result);
  return result.exitCode;
}

/**
 * Write all runner result messages to stdout/stderr.
 * info[] → stdout, warnings[] → stderr, message → stdout (success) or stderr (error).
 */
function writeResult(result: {
  exitCode: number;
  message?: string;
  warnings?: string[];
  info?: string[];
}): void {
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
