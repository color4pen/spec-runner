/**
 * CLI entry point for `specrunner job archive`.
 * Assembles dependencies from real implementations and runs the appropriate orchestrator.
 *
 * Design: exit code 0 (success/no-op), 1 (escalation/execution error), 2 (arg error).
 * No LLM involvement — purely deterministic.
 *
 * CLI input contract:
 *   specrunner job archive <slug> [--with-merge]
 */
import * as nodeFsPromises from "node:fs/promises";
import * as path from "node:path";
import { spawnCommand } from "../util/spawn.js";
import { runPlainArchive } from "../core/archive/plain-archive.js";
import { runMergeThenArchive } from "../core/archive/merge-then-archive.js";
import type { FinishFs } from "../core/finish/types.js";
import { parseRequestMd } from "../parser/request-md.js";
import { requestMdPath, archivedChangesDirRel, archivedChangeFolderPath } from "../util/paths.js";
import { composeGitHubIntegration } from "./github-composition.js";
import { loadConfig } from "../config/store.js";
import { DEFAULT_MERGE_WAIT_TIMEOUT_MS, DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS, resolveDesignLayerConfig } from "../config/schema.js";
import type { ResolvedDesignLayer, ShellCommand } from "../config/schema.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { registerExitGuard } from "../core/lifecycle/exit-guard.js";
import { logResult, logError, stderrWrite } from "../logger/stdout.js";
import { initPipelineLog, logPipelineEvent, closePipelineLog } from "../logger/pipeline-logger.js";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";
import { LocalRuntime } from "../core/runtime/local.js";
import { getGitHubIntegration } from "../state/github-integration.js";
import type { SpecRunnerConfig } from "../config/schema.js";

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
    rm: async (p: string, opts: { recursive: boolean; force: boolean }) => {
      await nodeFsPromises.rm(p, opts);
    },
  };
}

export interface RunArchiveOptions {
  /** Positional slug argument (required). */
  slug: string;
  /** --with-merge: merge the PR before archiving. */
  withMerge?: boolean;
  cwd: string;
  /** Override merge wait timeout in ms (from --merge-wait-ms flag). */
  mergeWaitMs?: number;
}

/**
 * Run the archive command.
 * Returns exit code: 0 (success), 1 (escalation/error), 2 (arg error).
 * Caller returns this exit code to the dispatch boundary (bin/specrunner.ts).
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
        path.join(opts.cwd, archivedChangesDirRel()),
      );
      const archiveEntry = archivedPaths.find((p) => p.endsWith(`-${opts.slug}`));
      if (archiveEntry) {
        const archivedReqPath = path.join(
          opts.cwd, archivedChangeFolderPath(archiveEntry), "request.md",
        );
        const parsed = await parseRequestMd(archivedReqPath);
        baseBranch = parsed.baseBranch;
      }
    } catch {
      // request.md not found — use fallback
    }
  }

  // Resolve the job's GitHub integration contract from stored job state.
  // This is used to: (a) reject --with-merge for disabled jobs before any state change,
  // and (b) skip token resolution when GitHub integration is disabled.
  let jobGithubEnabled = true; // default: enabled (backward compat)
  try {
    const allStates = resolvedJobIdForLog
      ? await JobStateStore.list(repoRoot)
      : [];
    const matchingState = allStates.find((s) => s.jobId === resolvedJobIdForLog);
    if (matchingState) {
      jobGithubEnabled = getGitHubIntegration(matchingState).enabled;
    }
  } catch {
    // Could not read job state — assume enabled (fail-safe)
  }

  // Reject --with-merge / --merge-wait-ms for disabled jobs BEFORE any state changes (T-09).
  if ((opts.withMerge || opts.mergeWaitMs !== undefined) && !jobGithubEnabled) {
    stderrWrite(
      "Error: --with-merge and --merge-wait-ms require GitHub integration. This job was started with github.enabled: false.",
    );
    stderrWrite("Hint: Run 'specrunner job archive <slug>' (without --with-merge) to archive this job.");
    closePipelineLog();
    return 2;
  }

  const disabledDesignLayer: ResolvedDesignLayer = { enabled: false, command: "aozu", requireCitationTypes: [], topicEmission: false };

  let archiveResult;
  try {
    if (opts.withMerge) {
      // --with-merge: resolve GitHub credentials and run merge-then-archive
      // (only reached when jobGithubEnabled === true, checked above)
      let waitTimeoutMs: number | null | undefined = undefined;
      let pollIntervalMs: number | undefined = undefined;
      let protectedPaths: string[] | undefined = undefined;
      let postMergeVerify: ShellCommand[] | undefined = undefined;
      let minimumAssurance: import("../config/schema.js").MinimumAssuranceConfig | undefined = undefined;
      let designLayerWithMerge: ResolvedDesignLayer = disabledDesignLayer;
      /** Hoisted config for floor gate — undefined when config loading fails (gate is no-op). */
      let mergeConfig: SpecRunnerConfig | undefined;
      try {
        const config = await loadConfig();
        mergeConfig = config;
        // Resolve wait timeout: flag override > config > default
        if (opts.mergeWaitMs !== undefined) {
          waitTimeoutMs = opts.mergeWaitMs;
        } else if (config.archive?.mergeWaitTimeoutMs !== undefined) {
          waitTimeoutMs = config.archive.mergeWaitTimeoutMs;
        } else {
          waitTimeoutMs = DEFAULT_MERGE_WAIT_TIMEOUT_MS;
        }
        pollIntervalMs = config.archive?.mergeWaitPollIntervalMs ?? DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS;
        protectedPaths = config.archive?.protectedPaths;
        postMergeVerify = config.archive?.postMergeVerify;
        minimumAssurance = config.archive?.minimumAssurance;
        designLayerWithMerge = resolveDesignLayerConfig(config);
      } catch {
        // Config not available — use defaults (no guard applied; no integrity check)
        // mergeConfig remains undefined → floor gate will treat runtime as unavailable (safe).
        if (opts.mergeWaitMs !== undefined) {
          waitTimeoutMs = opts.mergeWaitMs;
        } else {
          waitTimeoutMs = DEFAULT_MERGE_WAIT_TIMEOUT_MS;
        }
        pollIntervalMs = DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS;
      }

      // Resolve GitHub integration for --with-merge path (B-19: via composition).
      // Use the job's saved contract (jobGithubEnabled) as the authority, NOT the current
      // config. This allows --with-merge to succeed even when the project config was
      // changed to github.enabled: false after the job was started with GitHub enabled.
      let githubToken: string;
      let owner: string;
      let repoName: string;
      let githubClient: import("../core/port/github-client.js").GitHubClient;
      try {
        const mergeCompose = await composeGitHubIntegration(
          mergeConfig ?? await loadConfig(),
          opts.cwd,
          process.env as Record<string, string | undefined>,
          { overrideEnabled: jobGithubEnabled },  // job contract overrides config (T-archive-job-contract)
        );
        if (!mergeCompose.enabled || !mergeCompose.githubToken || !mergeCompose.repository || !mergeCompose.githubClient) {
          throw new SpecRunnerError(
            ERROR_CODES.GITHUB_INTEGRATION_REQUIRED,
            "GitHub integration is required for --with-merge.",
            "--with-merge requires GitHub integration to be enabled.",
          );
        }
        githubToken = mergeCompose.githubToken;
        owner = mergeCompose.repository.owner;
        repoName = mergeCompose.repository.name;
        githubClient = mergeCompose.githubClient;
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

      // Construct LocalRuntime for the achieved-assurance floor gate (T-06).
      // Only injected when config loaded successfully (mergeConfig defined).
      // When config is absent, assuranceRuntime is undefined → floor gate is fail-closed for any
      // constrained dimension (but minimumAssurance will also be undefined, so gate is no-op).
      const assuranceRuntime = mergeConfig !== undefined
        ? new LocalRuntime({ cwd: opts.cwd, githubClient, githubToken, spawnFn: spawnCommand })
        : undefined;

      archiveResult = await runMergeThenArchive(
        {
          slug: opts.slug,
          cwd: opts.cwd,
          spawn: spawnCommand,
          fs: buildRealFs(),
          githubClient,
          githubToken,
          owner,
          repo: repoName,
          baseBranch,
          waitTimeoutMs,
          pollIntervalMs,
          protectedPaths,
          postMergeVerify,
          minimumAssurance,
          designLayer: designLayerWithMerge,
          assuranceRuntime,
        },
        logResult,
      );
    } else {
      // No --with-merge: plain archive.
      // Plain archive does NOT query GitHub PR state — no GitHub API client needed.
      // For disabled jobs, skip token resolution entirely (B-19).
      let archiveToken: string | undefined;
      let designLayerNoMerge: ResolvedDesignLayer = disabledDesignLayer;

      if (jobGithubEnabled) {
        // GitHub-enabled job: resolve token and design layer (best-effort)
        try {
          const config = await loadConfig();
          designLayerNoMerge = resolveDesignLayerConfig(config);
          const plainCompose = await composeGitHubIntegration(
            config,
            opts.cwd,
            process.env as Record<string, string | undefined>,
            { overrideEnabled: jobGithubEnabled },  // use job contract, not current config (T-archive-job-contract)
          );
          archiveToken = plainCompose.githubToken;
        } catch {
          // Token not required for non-merge path — best-effort
        }
      } else {
        // GitHub-disabled job: no token needed, just resolve design layer
        try {
          const config = await loadConfig();
          designLayerNoMerge = resolveDesignLayerConfig(config);
        } catch {
          // Config not available — use disabled design layer
        }
      }

      archiveResult = await runPlainArchive(
        {
          slug: opts.slug,
          cwd: opts.cwd,
          spawn: spawnCommand,
          fs: buildRealFs(),
          baseBranch,
          githubToken: archiveToken,
          designLayer: designLayerNoMerge,
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
    // For GitHub-disabled jobs, emit a completion advisory since there is no PR to merge.
    if (!jobGithubEnabled && !opts.withMerge) {
      logResult(
        `The feature branch has been preserved on the remote. ` +
        `Note: 'archived' does not imply the branch has been merged into the base branch. ` +
        `Integration with the base branch is left to the operator.`,
      );
    }
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

export const ARCHIVE_USAGE = `Usage: specrunner job archive <slug> [options]
       specrunner job archive --from-issue <n> [options]

Archive the completed change folder, remove worktree, and update job status.

Plain archive (without --with-merge): pushes an archive record commit to the feature branch,
transitions the job to archived status, and removes the worktree — all in a single run.
For jobs with GitHub integration enabled, a merged or open PR is expected on the remote.

For jobs with GitHub integration disabled: the archive record is pushed to the feature branch
and the job transitions to archived in one step. The remote feature branch is preserved for
manual review or merge. Note that "archived" does not imply the branch has been merged into
the base branch — that step must be performed externally.

Use --with-merge to wait for CI, merge the PR, and complete the full cleanup in one step
(requires GitHub integration enabled).

Arguments:
  <slug>            Slug of the request to archive.

Options:
  --from-issue <n>       Issue number to archive from (finds completed marker and closing PR).
                         Requires GitHub integration. Mutually exclusive with <slug>.
  --with-merge           Wait for PR checks to pass, merge, then archive (requires GitHub).
  --merge-wait-ms <ms>   Override the wait timeout for --with-merge (in milliseconds).
                         For unlimited wait, set archive.mergeWaitTimeoutMs: null in config.
  --help, -h             Show this help message

Note: <slug> and --from-issue are mutually exclusive. Specify exactly one.
`;


