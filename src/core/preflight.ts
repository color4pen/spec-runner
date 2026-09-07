/**
 * Fail-fast validation checks for specrunner run command.
 * Each check is independent and ordered — first failure exits.
 */

import { loadConfig } from "../config/store.js";
import { resolveDesignLayerConfig } from "../config/schema.js";
import { resolveGitHubIntegrationConfig } from "../config/github-integration.js";
import { resolveJobGitHubIntegration } from "./github/integration.js";
import { resolveGitHubToken } from "./credentials/github.js";
import { parseRequestMd } from "../parser/request-md.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { logInfo } from "../logger/stdout.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import { runDesignLayerCheckGate } from "./design-layer/check-gate.js";
import type { RuntimePrereqChecker, RuntimeCredentialsResolver, RuntimeCredentials } from "./port/runtime-prereqs.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";
import type { RepositoryOrigin } from "../state/schema/types.js";

export interface PreflightResult {
  config: SpecRunnerConfig;
  /**
   * GitHub repository identity (owner/name). Present when GitHub integration is enabled.
   * null when GitHub integration is disabled.
   */
  repo: OriginInfo | null;
  request: ParsedRequest;
  /** Whether GitHub integration is enabled for this job. */
  githubEnabled: boolean;
  /** Resolved GitHub token (from credentials file or GITHUB_TOKEN env var). null when disabled. */
  githubToken: string | null;
  /** Source of the resolved GitHub token. null when disabled. */
  githubTokenSource: "credentials" | "env" | "gh" | null;
  /** Forge-agnostic origin identity (always present). */
  origin: RepositoryOrigin;
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
  const repoRoot = await resolveRepoRoot(cwd);
  const config = await loadConfig(repoRoot ?? undefined);

  // Resolve GitHub integration contract from config
  const { enabled: githubEnabled } = resolveGitHubIntegrationConfig(config);

  if (githubEnabled) {
    logInfo("GitHub integration: enabled");
  } else {
    logInfo("GitHub integration: disabled");
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

  // Resolve runtime-specific credentials
  const { specRunnerApiKey, specRunnerApiKeySource }: RuntimeCredentials = await deps.credentialsResolver.resolve(
    config,
    env,
  );

  // Steps 3 & 4: Resolve GitHub integration (origin URL + optional GitHub identity + token).
  // resolveToken is injected so that the core seam (integration.ts) stays adapter-free (B-1).
  const resolved = await resolveJobGitHubIntegration({
    config,
    cwd,
    env,
    enabled: githubEnabled,
    resolveToken: resolveGitHubToken,
  });

  const origin = resolved.origin;
  const repo: OriginInfo | null = resolved.enabled ? resolved.repository : null;
  const githubToken: string | null = resolved.enabled ? resolved.token : null;
  const githubTokenSource: "credentials" | "env" | "gh" | null = resolved.enabled ? resolved.tokenSource : null;

  if (githubEnabled && githubTokenSource) {
    logInfo(`GitHub token source: ${githubTokenSource}`);
  }

  // Step 5: request.md parseable
  const request = await parseRequestMd(requestMdPath);

  // Step 6: Design-layer check gate (opt-in; no-op when disabled)
  const designLayer = resolveDesignLayerConfig(config);
  const gateResult = await runDesignLayerCheckGate({
    requestMdPath,
    requestType: request.type,
    designLayer,
    cwd,
  });
  if (!gateResult.passed) {
    throw new SpecRunnerError(
      ERROR_CODES.DESIGN_LAYER_CHECK_FAILED,
      "aozu の診断を確認し、request.md の [[id]] 引用を修正してください。",
      "設計要素引用の検証に失敗しました。",
    );
  }

  return {
    config,
    repo,
    request,
    githubEnabled,
    githubToken,
    githubTokenSource,
    origin,
    specRunnerApiKey,
    specRunnerApiKeySource,
  };
}
