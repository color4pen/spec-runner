/**
 * CLI entry point for `specrunner finish`.
 * Assembles FinishContext from real implementations and runs the orchestrator.
 *
 * Design: exit code 0 (success/no-op), 1 (escalation/execution error), 2 (arg error).
 * No LLM involvement — purely deterministic.
 *
 * CLI input contract (B chapter):
 *   specrunner finish [<slug>] [--pr=<num>] [--job=<jobId>] [--dry-run]
 */
import * as nodeFsPromises from "node:fs/promises";
import * as path from "node:path";
import { spawnCommand } from "../util/spawn.js";
import { runFinishOrchestrator } from "../core/finish/orchestrator.js";
import type { FinishFs } from "../core/finish/types.js";
import { parseRequestMd } from "../parser/request-md.js";
import { requestMdPath } from "../util/paths.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { getOriginInfo } from "../git/remote.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { loadConfig } from "../config/store.js";
import { SpecRunnerError } from "../errors.js";
import { registerExitGuard } from "../core/lifecycle/exit-guard.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { initPipelineLog, logPipelineEvent, closePipelineLog } from "../logger/pipeline-logger.js";
import { JobStateStore } from "../store/job-state-store.js";

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
  /** --pr=<num>: reverse-lookup via REST API. */
  prNumber?: number;
  /** --job=<jobId>: forensics / debug only. */
  jobId?: string;
  /** --dry-run: Phase 0 pre-flight only, no destructive ops. */
  dryRun?: boolean;
  cwd: string;
}

/**
 * Run the finish command.
 * Returns exit code: 0 (success), 1 (escalation/error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runFinish(opts: RunFinishOptions): Promise<number> {
  registerExitGuard(opts.cwd);

  // Load config (best-effort) to resolve GitHub host
  let githubHost = "github.com";
  let githubApiBaseUrl = "https://api.github.com";
  try {
    const config = await loadConfig();
    githubHost = resolveGitHubHost(config.github);
    githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  } catch {
    // Config not available — use defaults
  }

  // Resolve GitHub token — required for REST API calls
  let githubToken: string;
  try {
    const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
    githubToken = resolved.token;
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError("GitHub token not found. Run 'specrunner login' to authenticate.");
    }
    return 2;
  }

  // Resolve GitHub owner/repo from git origin
  let owner: string;
  let repoName: string;
  try {
    const originInfo = await getOriginInfo(opts.cwd, githubHost);
    owner = originInfo.owner;
    repoName = originInfo.name;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    return 2;
  }

  const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);

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

  // Resolve jobId for pipeline log initialization (best-effort — skip if unavailable)
  const repoRoot = opts.cwd;
  let resolvedJobIdForLog: string | undefined;
  if (opts.jobId) {
    resolvedJobIdForLog = opts.jobId;
  } else if (opts.slug) {
    try {
      resolvedJobIdForLog = await JobStateStore.resolveId(repoRoot, opts.slug);
    } catch {
      // Resolution failed — skip pipeline log init
    }
  }

  if (resolvedJobIdForLog) {
    initPipelineLog(repoRoot, resolvedJobIdForLog);
    logPipelineEvent({ type: "finish:start", jobId: resolvedJobIdForLog, slug: opts.slug });
  }

  let finishResult;
  try {
    finishResult = await runFinishOrchestrator(
      {
        slug: opts.slug,
        prNumber: opts.prNumber,
        jobId: opts.jobId,
        baseBranch,
        flags: {
          dryRun: opts.dryRun ?? false,
        },
        cwd: opts.cwd,
        spawn: spawnCommand,
        fs: buildRealFs(),
        githubClient,
        owner,
        repo: repoName,
      },
      logResult,
    );
    if (resolvedJobIdForLog) {
      logPipelineEvent({ type: "finish:complete", jobId: resolvedJobIdForLog, exitCode: finishResult.exitCode });
    }
  } catch (err) {
    if (resolvedJobIdForLog) {
      logPipelineEvent({ type: "finish:error", jobId: resolvedJobIdForLog, error: (err as Error).message });
    }
    throw err;
  } finally {
    closePipelineLog();
  }

  if (finishResult.exitCode === 0) {
    return 0;
  }

  if (finishResult.exitCode === 1) {
    stderrWrite(finishResult.escalation);
    return 1;
  }

  // exitCode === 2
  stderrWrite(finishResult.message);
  return 2;
}
