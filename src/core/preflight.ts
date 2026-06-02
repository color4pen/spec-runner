/**
 * Fail-fast validation checks for specrunner run command.
 * Each check is independent and ordered — first failure exits.
 */

import { loadConfig } from "../config/store.js";
import { checkConfigComplete } from "../config/schema.js";
import { getOriginInfo } from "../git/remote.js";
import { parseRequestMd } from "../parser/request-md.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { resolveGitHubHost } from "../config/github-host.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { logInfo } from "../logger/stdout.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import type { RuntimePrereqChecker, RuntimeCredentialsResolver, RuntimeCredentials } from "./port/runtime-prereqs.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

export interface PreflightResult {
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  /** Resolved GitHub token (from credentials file or GITHUB_TOKEN env var). */
  githubToken: string;
  /** Source of the resolved GitHub token. */
  githubTokenSource: "credentials" | "env" | "gh";
  /** Resolved Anthropic API key (present only for managed runtime). */
  specRunnerApiKey?: string;
  /** Source of the resolved Anthropic API key. */
  specRunnerApiKeySource?: "credentials" | "env";
}

/**
 * Run all preflight checks in order.
 * Throws SpecRunnerError on the first failing check.
 */
export async function runPreflight(
  requestMdPath: string,
  cwd: string,
  env: Record<string, string | undefined>,
  deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver },
): Promise<PreflightResult> {
  // Step 1: Config exists (load user global + project local overlay from repo root)
  // Resolve repo root from cwd for project local config overlay support.
  // resolveRepoRoot returns null gracefully when not in a git repo (loadConfig handles null → user-global-only).
  const repoRoot = await resolveRepoRoot(cwd);
  const config = await loadConfig(repoRoot ?? undefined);

  // Step 2: Config complete (all required fields present — github check moved here)
  const incomplete = checkConfigComplete(config);
  if (incomplete) {
    throw new SpecRunnerError(
      "CONFIG_INCOMPLETE",
      incomplete.hint,
      incomplete.hint,
    );
  }

  // Step 2.5: GitHub token (required for PR operations via REST API)
  const githubHost = resolveGitHubHost(config.github);
  let githubToken: string;
  let githubTokenSource: "credentials" | "env" | "gh";
  try {
    const resolved = await resolveGitHubToken(env, { host: githubHost });
    githubToken = resolved.token;
    githubTokenSource = resolved.source;
    logInfo(`GitHub token source: ${resolved.source}`);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      throw new SpecRunnerError(
        ERROR_CODES.RUNTIME_PREREQ_MISSING,
        err.hint,
        err.message,
      );
    }
    throw err;
  }

  // Step 2.7: Runtime prerequisites (managed-specific)
  const prereq = await deps.prereqChecker.check(config, env);
  if (prereq) {
    throw new SpecRunnerError(
      ERROR_CODES.RUNTIME_PREREQ_MISSING,
      prereq.hint,
      `Missing runtime prerequisite: ${prereq.field}.`,
    );
  }

  // Resolve runtime-specific credentials (managed: Anthropic API key; local: empty)
  const { specRunnerApiKey, specRunnerApiKeySource }: RuntimeCredentials = await deps.credentialsResolver.resolve(
    config,
    env,
  );

  // Step 3 & 4: Git repo + GitHub remote
  const repo = await getOriginInfo(cwd, githubHost);

  // Step 5: request.md parseable
  const request = await parseRequestMd(requestMdPath);

  return { config, repo, request, githubToken, githubTokenSource, specRunnerApiKey, specRunnerApiKeySource };
}
