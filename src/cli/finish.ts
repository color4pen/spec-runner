/**
 * CLI entry point for `specrunner finish`.
 * Assembles FinishContext from real implementations and runs the orchestrator.
 *
 * Design: exit code 0 (success/no-op), 1 (escalation/execution error), 2 (arg error).
 * No LLM involvement — purely deterministic.
 */
import * as nodeFsPromises from "node:fs/promises";
import { spawnCommand } from "../util/spawn.js";
import { runFinishOrchestrator } from "../core/finish/orchestrator.js";
import type { FinishFs } from "../core/finish/types.js";

/**
 * Build a FinishFs from real fs modules.
 */
function buildRealFs(): FinishFs {
  return {
    exists: async (p: string) => {
      try {
        await nodeFsPromises.access(p);
        return true;
      } catch {
        return false;
      }
    },
    readdir: async (p: string) => {
      const dirents = await nodeFsPromises.readdir(p, { withFileTypes: true });
      return dirents.map((d) => d.name);
    },
    mkdir: async (p: string, opts: { recursive: boolean }) => {
      await nodeFsPromises.mkdir(p, opts);
    },
    writeFile: async (p: string, content: string) => {
      await nodeFsPromises.writeFile(p, content, "utf-8");
    },
    unlink: async (p: string) => {
      await nodeFsPromises.unlink(p);
    },
  };
}

export interface RunFinishOptions {
  jobId?: string;
  slug?: string;
  force: boolean;
  cleanupOnly: boolean;
  cwd: string;
}

/**
 * Run the finish command.
 * Returns exit code: 0 (success), 1 (escalation/error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runFinish(opts: RunFinishOptions): Promise<number> {
  const result = await runFinishOrchestrator(
    {
      jobId: opts.jobId,
      slug: opts.slug,
      flags: {
        force: opts.force,
        cleanupOnly: opts.cleanupOnly,
      },
      cwd: opts.cwd,
      spawn: spawnCommand,
      fs: buildRealFs(),
    },
    (msg) => process.stdout.write(msg + "\n"),
  );

  if (result.exitCode === 0) {
    return 0;
  }

  if (result.exitCode === 1) {
    process.stdout.write(result.escalation + "\n");
    return 1;
  }

  // exitCode === 2
  process.stderr.write(result.message + "\n");
  return 2;
}
