/**
 * CLI entry point for `specrunner job prune`.
 *
 * Exit codes: 0 (success / dry-run), 1 (execution error), 2 (arg error).
 *
 * Usage:
 *   specrunner job prune           # dry-run: list orphan worktrees and sidecars without deleting
 *   specrunner job prune --force   # delete orphan worktrees, sidecars, and local branches
 */
import * as nodeFsSync from "node:fs";
import * as nodeFsPromises from "node:fs/promises";
import { SpecRunnerError } from "../errors.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { spawnCommand } from "../util/spawn.js";
import type { SidecarPruneFs } from "../core/prune/sidecar-runner.js";

export interface RunPruneOptions {
  force: boolean;
}

/**
 * Run the prune command.
 * Returns exit code: 0 (success), 1 (error).
 * Caller (command-registry.ts) is responsible for process.exit().
 *
 * Note: pruneOrphanWorktrees, pruneOrphanSidecars, and resolveRepoRootOrFail are
 * imported lazily (via dynamic import) so that vi.mock factory closures in tests
 * are evaluated after the outer const mock variables have been initialized.
 */
export async function runPrune(opts: RunPruneOptions): Promise<number> {
  const { force } = opts;

  // Lazy imports allow vi.mock factory binding in tests.
  const { resolveRepoRootOrFail } = await import("../util/repo-root.js");
  const { pruneOrphanWorktrees } = await import("../core/prune/runner.js");
  const { pruneOrphanSidecars } = await import("../core/prune/sidecar-runner.js");

  let repoRoot: string;
  try {
    repoRoot = await resolveRepoRootOrFail();
  } catch (err: unknown) {
    logError((err as Error).message);
    return 1;
  }

  const worktreeManager = createWorktreeManager();

  // Build node-fs adapter for sidecar prune (superset of SidecarScanFs + rm)
  const sidecarFs: SidecarPruneFs = {
    existsSync: nodeFsSync.existsSync,
    readdirSync: (p: string) => nodeFsSync.readdirSync(p) as string[],
    stat: nodeFsPromises.stat as SidecarPruneFs["stat"],
    readFile: (p: string, enc: "utf-8") => nodeFsPromises.readFile(p, enc),
    rm: (p: string, o: { recursive: boolean; force: boolean }) =>
      nodeFsPromises.rm(p, o),
  };

  let worktreeResult;
  let sidecarResult;

  try {
    worktreeResult = await pruneOrphanWorktrees({
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

  try {
    sidecarResult = await pruneOrphanSidecars({
      force,
      deps: {
        repoRoot,
        fs: sidecarFs,
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

  // Print labeled sections
  logResult("Orphan worktrees:");
  writeResult(worktreeResult);

  logResult("Orphan sidecars:");
  writeResult(sidecarResult);

  // Combine exit codes: return 1 if either runner failed
  return worktreeResult.exitCode || sidecarResult.exitCode;
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
