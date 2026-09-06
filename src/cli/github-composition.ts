/**
 * GitHub integration composition root.
 *
 * Bridges the core integration seam (src/core/github/integration.ts) with the
 * adapter layer (GitHubClient construction). This is the ONLY place in the
 * composition root that calls createGitHubClient and resolveGitHubToken for
 * regular job operations (login/credentials/doctor have their own call sites).
 *
 * B-10: resolveGitHubToken always gets host; createGitHubClient always gets baseUrl.
 * B-19: resolveGitHubToken / createGitHubClient calls outside this file and the
 *        allowlist (login, credentials, doctor) are architecture violations.
 */
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { resolveJobGitHubIntegration } from "../core/github/integration.js";
import { resolveGitHubIntegrationConfig } from "../config/github-integration.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import type { GitHubClient } from "../core/port/github-client.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { RepositoryOrigin } from "../state/schema/types.js";

export interface GitHubCompositionResult {
  /** Whether GitHub integration is enabled for this job. */
  enabled: boolean;
  /** GitHub API client. null when integration is disabled. */
  githubClient: GitHubClient | null;
  /** Resolved GitHub token. undefined when integration is disabled. */
  githubToken: string | undefined;
  /** GitHub token source. undefined when integration is disabled. */
  tokenSource: "credentials" | "env" | "gh" | undefined;
  /** Repository identity for GitHub-enabled jobs. */
  repository: { owner: string; name: string } | null;
  /** Forge-agnostic origin identity (always present). */
  origin: RepositoryOrigin;
}

/**
 * Compose GitHub integration from config and environment.
 *
 * Resolves the GitHub integration contract, then constructs the GitHubClient
 * (only when integration is enabled) and collects all relevant fields.
 *
 * @param config  Loaded project config (github.enabled is read from config.github.enabled).
 * @param cwd     Working directory (for git remote URL resolution).
 * @param env     Environment variables (for token resolution).
 */
export async function composeGitHubIntegration(
  config: SpecRunnerConfig,
  cwd: string,
  env: Record<string, string | undefined>,
): Promise<GitHubCompositionResult> {
  const { enabled } = resolveGitHubIntegrationConfig(config);

  const resolved = await resolveJobGitHubIntegration({
    config,
    cwd,
    env,
    enabled,
    resolveToken: resolveGitHubToken,
  });

  if (!resolved.enabled) {
    return {
      enabled: false,
      githubClient: null,
      githubToken: undefined,
      tokenSource: undefined,
      repository: null,
      origin: resolved.origin,
    };
  }

  const githubClient = createGitHubClient(fetch, resolved.token, resolved.apiBaseUrl);

  return {
    enabled: true,
    githubClient,
    githubToken: resolved.token,
    tokenSource: resolved.tokenSource,
    repository: resolved.repository,
    origin: resolved.origin,
  };
}

/**
 * Compose GitHub integration from a pre-resolved integration result.
 * Used by resume/attach paths that receive the contract from stored job state.
 *
 * When enabled is true, resolveToken is called with the stored host/apiBaseUrl.
 * When enabled is false, no token or client is created.
 */
export async function composeGitHubIntegrationForJob(opts: {
  enabled: boolean;
  config: SpecRunnerConfig;
  env: Record<string, string | undefined>;
}): Promise<{ githubClient: GitHubClient | null; githubToken: string | undefined }> {
  if (!opts.enabled) {
    return { githubClient: null, githubToken: undefined };
  }

  const { config, env } = opts;
  const githubHost = resolveGitHubHost(config.github);
  const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  const { token: githubToken } = await resolveGitHubToken(env, { host: githubHost });
  const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);

  return { githubClient, githubToken };
}

/**
 * Build a GitHubClient from a pre-resolved token (e.g., from preflight).
 *
 * Use this in the run path where token resolution already happened in preflight.
 * This keeps `createGitHubClient` confined to src/cli/github-composition.ts (B-19).
 *
 * Returns null when githubToken is null (i.e., GitHub integration is disabled).
 */
export function buildGitHubClientFromToken(
  githubToken: string | null,
  config: SpecRunnerConfig,
): GitHubClient | null {
  if (githubToken === null) return null;
  const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  return createGitHubClient(fetch, githubToken, githubApiBaseUrl);
}
