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
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { SpecRunnerError } from "../errors.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { spawnCommand } from "../util/spawn.js";
import type { SidecarPruneFs } from "../core/prune/sidecar-runner.js";
import { isOrphanSidecar } from "../core/sidecar/orphan.js";

export interface RunPruneOptions {
  force: boolean;
  /** Dispatch-resolved repo root (provided by the registry handler via ctx.repoRoot). */
  repoRoot: string;
}

/**
 * Run the prune command.
 * Returns exit code: 0 (success), 1 (error).
 * Caller returns this exit code to the dispatch boundary (bin/specrunner.ts).
 *
 * Note: pruneOrphanWorktrees and pruneOrphanSidecars are imported lazily (via
 * dynamic import) so that vi.mock factory closures in tests are evaluated after
 * the outer const mock variables have been initialized.
 */
export async function runPrune(opts: RunPruneOptions): Promise<number> {
  const { force, repoRoot } = opts;

  // Lazy imports allow vi.mock factory binding in tests.
  const { pruneOrphanWorktrees } = await import("../core/prune/runner.js");
  const { pruneOrphanSidecars } = await import("../core/prune/sidecar-runner.js");

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
        recheck: isOrphanSidecar,
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
 * CLI handler for `specrunner job prune`.
 * Returns the exit code; process termination is owned by the dispatch boundary.
 */
/* c8 ignore next 6 */
export async function handleJobPrune(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  return await runPrune({
    force: !!parsed.flags["force"],
    repoRoot: ctx!.repoRoot!,
  });
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
