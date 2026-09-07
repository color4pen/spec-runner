/**
 * GitHub integration resolution seam — core layer.
 *
 * Resolves the full GitHub integration context for a job start.
 * This is the ONLY place in the core layer that decides whether to invoke
 * GitHub credential resolution. Adapters (GitHubClient) are NOT imported here
 * (B-1: domain must not import adapter implementations).
 *
 * Used by composition-root (src/cli/) to build the initial job context.
 */
import { getOriginUrl, parseRemoteUrl, normalizeOriginIdentity } from "../../git/remote.js";
import { resolveGitHubHost, resolveGitHubApiBaseUrl } from "../../config/github-host.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { RepositoryOrigin } from "../../state/schema/types.js";

/** Result when GitHub integration is disabled. */
export interface GitHubIntegrationDisabled {
  enabled: false;
  /** Forge-agnostic origin identity for the git remote. */
  origin: RepositoryOrigin;
}

/** Result when GitHub integration is enabled. */
export interface GitHubIntegrationEnabled {
  enabled: true;
  token: string;
  tokenSource: "credentials" | "env" | "gh";
  host: string;
  apiBaseUrl: string;
  repository: { owner: string; name: string };
  origin: RepositoryOrigin;
}

export type ResolvedGitHubIntegration = GitHubIntegrationDisabled | GitHubIntegrationEnabled;

export interface ResolveJobGitHubIntegrationOptions {
  config: SpecRunnerConfig;
  cwd: string;
  env: Record<string, string | undefined>;
  /** Whether GitHub integration is enabled (from config resolution). */
  enabled: boolean;
  /** Token resolver — injected by composition root to satisfy B-1. */
  resolveToken: (
    env: Record<string, string | undefined>,
    opts: { host: string },
  ) => Promise<{ token: string; source: "credentials" | "env" | "gh" }>;
}

/**
 * Resolve the full GitHub integration context for a job.
 *
 * When enabled === false:
 *   - Does NOT call resolveToken or touch GitHub config
 *   - Resolves the origin URL and normalizes to a RepositoryOrigin
 *   - Returns GitHubIntegrationDisabled
 *
 * When enabled === true:
 *   - Resolves GitHub host and API base URL from config
 *   - Calls resolveToken to obtain the GitHub token
 *   - Parses origin URL to extract GitHub owner/name
 *   - Returns GitHubIntegrationEnabled
 *
 * B-1: No adapter imports. The resolveToken function and client construction
 * are provided by the composition root (src/cli/).
 */
export async function resolveJobGitHubIntegration(
  opts: ResolveJobGitHubIntegrationOptions,
): Promise<ResolvedGitHubIntegration> {
  const { config, cwd, env, enabled, resolveToken } = opts;

  if (!enabled) {
    // Disabled path: get origin URL for identity (no token needed)
    const originUrl = await getOriginUrl(cwd);
    const origin = normalizeOriginIdentity(originUrl);
    return { enabled: false, origin };
  }

  // GitHub-enabled path: resolve token FIRST (fast-fail before git remote check).
  // This preserves the pre-feature exit-code ordering: missing token → exit 1,
  // not-a-git-repo → exit 2. (B-10: host is passed to resolveToken.)
  const host = resolveGitHubHost(config.github);
  const apiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  const { token, source: tokenSource } = await resolveToken(env, { host });

  // Then get origin URL (needed for repository identity + parseRemoteUrl)
  const originUrl = await getOriginUrl(cwd);
  const origin = normalizeOriginIdentity(originUrl);
  const repository = parseRemoteUrl(originUrl, host);

  return {
    enabled: true,
    token,
    tokenSource,
    host,
    apiBaseUrl,
    repository,
    origin,
  };
}
