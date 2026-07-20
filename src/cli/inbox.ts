/**
 * CLI handler for `specrunner inbox run`.
 *
 * Resolves config, GitHub client, origin info, and delegates to runInboxOrchestrator.
 */
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { getOriginInfo } from "../git/remote.js";
import { resolveInboxConfig } from "../config/schema.js";
import { runInboxOrchestrator } from "../core/inbox/run-inbox.js";
import { logError, stderrWrite } from "../logger/stdout.js";
import { EXIT_CODE } from "../errors.js";

export interface InboxRunCliOptions {
  dryRun?: boolean;
  /** Override for maxStartsPerRun from --limit flag. */
  limit?: number;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  /** Dispatch-resolved repo root (provided by the registry handler via ctx.repoRoot). */
  repoRoot: string;
}

/**
 * Entry point for `specrunner inbox run`.
 * Returns process exit code.
 */
export async function runInboxRun(options: InboxRunCliOptions): Promise<number> {
  try {
    const repoRoot = options.repoRoot;

    // Resolve config (pre-resolved repoRoot passed to avoid redundant git resolution)
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    // Resolve GitHub token
    const githubHost = resolveGitHubHost(config.github);
    const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
    let githubToken: string;
    try {
      const result = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
      githubToken = result.token;
    } catch (err) {
      logError(`Failed to resolve GitHub token: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    // Resolve origin info (owner/repo)
    let owner: string;
    let repo: string;
    try {
      const origin = await getOriginInfo(repoRoot, githubHost);
      owner = origin.owner;
      repo = origin.name;
    } catch (err) {
      logError(`Failed to resolve git origin: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    // Create GitHub client
    const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);

    // Resolve inbox config (with defaults)
    const inboxConfig = resolveInboxConfig(config);
    const maxStartsPerRun = options.limit !== undefined ? options.limit : inboxConfig.maxStartsPerRun;

    // Run orchestrator
    const summary = await runInboxOrchestrator({
      githubClient,
      owner,
      repo,
      repoRoot,
      approveLabel: inboxConfig.approveLabel,
      maxStartsPerRun,
      dryRun: options.dryRun,
      json: options.json,
    });

    // Human-readable summary (non-JSON mode)
    if (!options.json && !options.dryRun) {
      const total = summary.started.length + summary.rejected.length + summary.resumed.length + summary.recovered.length + summary.escalated.length;
      if (total === 0 && summary.errors.length === 0) {
        stderrWrite("[inbox] Nothing to do.");
      }
      if (summary.errors.length > 0) {
        for (const e of summary.errors) {
          stderrWrite(`[inbox] error: ${e.action}: ${e.error}`);
        }
        return 1;
      }
    }

    return 0;
  } catch (err) {
    logError(`inbox run failed: ${(err as Error).message}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}
