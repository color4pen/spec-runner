/**
 * bootstrap: shared CLI initialisation for create and resume commands.
 *
 * Encapsulates loadConfig → createGitHubClient → createRuntime.
 * Callers are responsible for resolving `repo` before calling bootstrap()
 * (each command obtains repo differently: create via getOriginInfo, resume via state).
 *
 * run.ts does NOT use bootstrap() — it uses preflight() which already returns config + repo.
 */
import { loadConfig } from "../config/store.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { createRuntime } from "../core/runtime/index.js";
import type { OriginInfo } from "../git/remote.js";
import type { RuntimeStrategy } from "../core/runtime/strategy.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { GitHubClient } from "../core/port/github-client.js";

export interface BootstrapResult {
  config: SpecRunnerConfig;
  githubClient: GitHubClient;
  runtime: RuntimeStrategy;
}

/**
 * Load config, create GitHub client and runtime for the given working directory and repo.
 * Throws on config load failure — callers handle the error.
 */
export async function bootstrap(cwd: string, repo: OriginInfo): Promise<BootstrapResult> {
  const config = await loadConfig();
  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");
  const sessionClient =
    config.runtime !== "local" && config.anthropic?.apiKey
      ? createAnthropicSessionClient(createAnthropicClient(config.anthropic.apiKey))
      : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient);
  return { config, githubClient, runtime };
}
