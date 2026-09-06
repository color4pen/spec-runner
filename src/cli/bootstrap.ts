/**
 * bootstrap: shared CLI initialisation for create and resume commands.
 *
 * Encapsulates loadConfig → composeGitHubIntegrationForJob → createRuntime.
 * Callers are responsible for resolving `repo` before calling bootstrap()
 * (each command obtains repo differently: create via getOriginInfo, resume via state).
 *
 * run.ts does NOT use bootstrap() — it uses preflight() which already returns config + repo.
 *
 * B-19: GitHub token resolution and client construction are confined to
 * src/cli/github-composition.ts. bootstrap() delegates to composeGitHubIntegrationForJob.
 */
import { loadConfig } from "../config/store.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { composeGitHubIntegrationForJob } from "./github-composition.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { createRuntime } from "../core/runtime/index.js";
import { resolveGitHubIntegrationConfig } from "../config/github-integration.js";
import type { OriginInfo } from "../git/remote.js";
import type { RuntimeFacade } from "../core/runtime-facade.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { GitHubClient } from "../core/port/github-client.js";

export interface BootstrapResult {
  config: SpecRunnerConfig;
  githubClient: GitHubClient | null;
  runtime: RuntimeFacade;
  githubToken: string | undefined;
}

/**
 * Load config, resolve GitHub client (when integration is enabled), and create runtime for the given working directory and repo.
 * Throws on config load failure or missing GitHub token when enabled — callers handle the error.
 *
 * @param cwd                  Invoker working directory (used for runtime setup).
 * @param repo                 Origin info (owner/name). null when GitHub integration is disabled.
 * @param repoRoot             Dispatch-resolved repo root, or null when outside a repo. When null,
 *                             config is loaded from the global config only (no project-local overlay).
 * @param githubEnabledOverride When provided, use this value instead of re-reading github.enabled
 *                             from the current config. Must be set on resume/reopen/attach/archive
 *                             paths so the stored job state (D1) is authoritative, not the current
 *                             config (which may have changed since the job was started).
 */
export async function bootstrap(cwd: string, repo: OriginInfo | null, repoRoot: string | null = null, githubEnabledOverride?: boolean): Promise<BootstrapResult> {
  const config = await loadConfig(repoRoot ?? undefined);
  const { enabled: githubEnabled } = githubEnabledOverride !== undefined
    ? { enabled: githubEnabledOverride }
    : resolveGitHubIntegrationConfig(config);
  const { githubClient, githubToken } = await composeGitHubIntegrationForJob({
    enabled: githubEnabled,
    config,
    env: process.env as Record<string, string | undefined>,
  });
  const anthropicResult = config.runtime === "managed"
    ? await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>)
    : await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, { optional: true });
  const sessionClient = anthropicResult
    ? createAnthropicSessionClient(createAnthropicClient(anthropicResult.apiKey))
    : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken, { githubEnabled });
  return { config, githubClient, runtime, githubToken };
}
