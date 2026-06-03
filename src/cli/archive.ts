/**
 * CLI entry point for `specrunner job archive`.
 * Assembles dependencies from real implementations and runs the appropriate orchestrator.
 *
 * Design: exit code 0 (success/no-op), 1 (escalation/execution error), 2 (arg error).
 * No LLM involvement — purely deterministic.
 *
 * CLI input contract:
 *   specrunner job archive <slug> [--with-merge] [--dry-run]
 */
import * as nodeFsPromises from "node:fs/promises";
import * as path from "node:path";
import { spawnCommand } from "../util/spawn.js";
import { runArchiveOrchestrator } from "../core/archive/orchestrator.js";
import { runMergeThenArchive } from "../core/archive/merge-then-archive.js";
import type { FinishFs } from "../core/finish/types.js";
import { parseRequestMd } from "../parser/request-md.js";
import { requestMdPath } from "../util/paths.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { getOriginInfo } from "../git/remote.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { loadConfig } from "../config/store.js";
import { DEFAULT_MERGE_WAIT_TIMEOUT_MS, DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS } from "../config/schema.js";
import { SpecRunnerError } from "../errors.js";
import { registerExitGuard } from "../core/lifecycle/exit-guard.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { initPipelineLog, logPipelineEvent, closePipelineLog } from "../logger/pipeline-logger.js";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";

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

export interface RunArchiveOptions {
  /** Positional slug argument (required). */
  slug: string;
  /** --with-merge: merge the PR before archiving. */
  withMerge?: boolean;
  /** --dry-run: reserved for future use (currently no-op). */
  dryRun?: boolean;
  cwd: string;
  /** Override merge wait timeout in ms (from --merge-wait-ms flag). */
  mergeWaitMs?: number;
}

/**
 * Run the archive command.
 * Returns exit code: 0 (success), 1 (escalation/error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runArchive(opts: RunArchiveOptions): Promise<number> {
  registerExitGuard(opts.cwd);

  const repoRoot = opts.cwd;

  // Resolve jobId for pipeline log initialization (best-effort)
  let resolvedJobIdForLog: string | undefined;
  try {
    const allStates = await JobStateStore.list(repoRoot);
    const matching = allStates.filter((s) => getJobSlug(s) === opts.slug);
    if (matching.length > 0) {
      matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolvedJobIdForLog = matching[0]!.jobId;
    }
  } catch {
    // Resolution failed — skip pipeline log init
  }

  if (resolvedJobIdForLog) {
    initPipelineLog(repoRoot, resolvedJobIdForLog);
    logPipelineEvent({ type: "archive:start", jobId: resolvedJobIdForLog, slug: opts.slug });
  }

  // Resolve baseBranch from request.md (best-effort)
  let baseBranch = "main";
  try {
    // Try active change folder first
    const requestMdAbsPath = path.join(opts.cwd, requestMdPath(opts.slug));
    const parsed = await parseRequestMd(requestMdAbsPath);
    baseBranch = parsed.baseBranch;
  } catch {
    // Try archived change folder (may already be archived)
    try {
      const archivedPaths = await nodeFsPromises.readdir(
        path.join(opts.cwd, "specrunner", "changes", "archive"),
      );
      const archiveEntry = archivedPaths.find((p) => p.endsWith(`-${opts.slug}`));
      if (archiveEntry) {
        const archivedReqPath = path.join(
          opts.cwd, "specrunner", "changes", "archive", archiveEntry, "request.md",
        );
        const parsed = await parseRequestMd(archivedReqPath);
        baseBranch = parsed.baseBranch;
      }
    } catch {
      // request.md not found — use fallback
    }
  }

  let archiveResult;
  try {
    if (opts.withMerge) {
      // --with-merge: resolve GitHub credentials and run merge-then-archive
      let githubHost = "github.com";
      let githubApiBaseUrl = "https://api.github.com";
      let waitTimeoutMs: number | null | undefined = undefined;
      let pollIntervalMs: number | undefined = undefined;
      try {
        const config = await loadConfig();
        githubHost = resolveGitHubHost(config.github);
        githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
        // Resolve wait timeout: flag override > config > default
        if (opts.mergeWaitMs !== undefined) {
          waitTimeoutMs = opts.mergeWaitMs;
        } else if (config.archive?.mergeWaitTimeoutMs !== undefined) {
          waitTimeoutMs = config.archive.mergeWaitTimeoutMs;
        } else {
          waitTimeoutMs = DEFAULT_MERGE_WAIT_TIMEOUT_MS;
        }
        pollIntervalMs = config.archive?.mergeWaitPollIntervalMs ?? DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS;
      } catch {
        // Config not available — use defaults
        if (opts.mergeWaitMs !== undefined) {
          waitTimeoutMs = opts.mergeWaitMs;
        } else {
          waitTimeoutMs = DEFAULT_MERGE_WAIT_TIMEOUT_MS;
        }
        pollIntervalMs = DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS;
      }

      let githubToken: string;
      try {
        const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
        githubToken = resolved.token;
      } catch (err) {
        if (resolvedJobIdForLog) {
          logPipelineEvent({ type: "archive:error", jobId: resolvedJobIdForLog, error: "GitHub token not found" });
        }
        if (err instanceof SpecRunnerError) {
          logError(err.message);
          stderrWrite(`Hint: ${err.hint}`);
        } else {
          logError("GitHub token not found. Run 'specrunner login' to authenticate.");
        }
        closePipelineLog();
        return 2;
      }

      let owner: string;
      let repoName: string;
      try {
        const originInfo = await getOriginInfo(opts.cwd, githubHost);
        owner = originInfo.owner;
        repoName = originInfo.name;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError(message);
        closePipelineLog();
        return 2;
      }

      const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);

      archiveResult = await runMergeThenArchive(
        {
          slug: opts.slug,
          cwd: opts.cwd,
          spawn: spawnCommand,
          fs: buildRealFs(),
          githubClient,
          owner,
          repo: repoName,
          baseBranch,
          waitTimeoutMs,
          pollIntervalMs,
        },
        logResult,
      );
    } else {
      // No --with-merge: run archive orchestrator directly
      archiveResult = await runArchiveOrchestrator(
        {
          slug: opts.slug,
          cwd: opts.cwd,
          spawn: spawnCommand,
          fs: buildRealFs(),
          baseBranch,
        },
        logResult,
      );
    }

    if (resolvedJobIdForLog) {
      logPipelineEvent({ type: "archive:complete", jobId: resolvedJobIdForLog, exitCode: archiveResult.exitCode });
    }
  } catch (err) {
    if (resolvedJobIdForLog) {
      logPipelineEvent({ type: "archive:error", jobId: resolvedJobIdForLog, error: (err as Error).message });
    }
    throw err;
  } finally {
    closePipelineLog();
  }

  if (archiveResult.exitCode === 0) {
    return 0;
  }

  if (archiveResult.exitCode === 1) {
    stderrWrite(archiveResult.escalation);
    return 1;
  }

  // exitCode === 2
  stderrWrite(archiveResult.message);
  return 2;
}
