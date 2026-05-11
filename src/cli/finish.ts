/**
 * CLI entry point for `specrunner finish`.
 * Assembles FinishContext from real implementations and runs the orchestrator.
 *
 * Design: exit code 0 (success/no-op), 1 (escalation/execution error), 2 (arg error).
 * No LLM involvement — purely deterministic.
 *
 * CLI input contract (B chapter):
 *   specrunner finish [<slug>] [--pr=<num>] [--job=<jobId>] [--dry-run] [--force]
 */
import * as nodeFsPromises from "node:fs/promises";
import * as path from "node:path";
import { spawnCommand } from "../util/spawn.js";
import { runFinishOrchestrator } from "../core/finish/orchestrator.js";
import type { FinishFs } from "../core/finish/types.js";
import { parseRequestMd } from "../parser/request-md.js";
import { requestMdPath } from "../util/paths.js";

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
    stat: async (p: string) => {
      const stats = await nodeFsPromises.stat(p);
      return { isDirectory: () => stats.isDirectory() };
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
    readFile: async (p: string) => {
      return nodeFsPromises.readFile(p, "utf-8");
    },
  };
}

export interface RunFinishOptions {
  /** Positional slug argument — first form (recommended). */
  slug?: string;
  /** --pr=<num>: reverse-lookup via gh pr view. */
  prNumber?: number;
  /** --job=<jobId>: forensics / debug only. */
  jobId?: string;
  /** --dry-run: Phase 0 pre-flight only, no destructive ops. */
  dryRun?: boolean;
  /** --force: use --admin for blocked PRs. */
  force: boolean;
  cwd: string;
}

/**
 * Run the finish command.
 * Returns exit code: 0 (success), 1 (escalation/error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runFinish(opts: RunFinishOptions): Promise<number> {
  // Resolve baseBranch from request.md if slug is available
  let baseBranch = "main"; // fallback for slug-less paths (--pr, --job)
  if (opts.slug) {
    try {
      const requestMdAbsPath = path.join(opts.cwd, requestMdPath(opts.slug));
      const parsed = await parseRequestMd(requestMdAbsPath);
      baseBranch = parsed.baseBranch;
    } catch {
      // request.md not found or parse error — use fallback
    }
  }

  const result = await runFinishOrchestrator(
    {
      slug: opts.slug,
      prNumber: opts.prNumber,
      jobId: opts.jobId,
      baseBranch,
      flags: {
        force: opts.force,
        dryRun: opts.dryRun ?? false,
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
    process.stderr.write(result.escalation + "\n");
    return 1;
  }

  // exitCode === 2
  process.stderr.write(result.message + "\n");
  return 2;
}
