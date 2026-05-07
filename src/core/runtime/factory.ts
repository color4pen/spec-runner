/**
 * createRuntime: factory for RuntimeStrategy.
 *
 * Design D4: ALL config.runtime branching is confined to this function.
 * No other code in the codebase (except src/config/ schema and src/cli/rm.ts)
 * should branch on config.runtime.
 */
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { GitHubClient } from "../port/github-client.js";
import type { OriginInfo } from "../../git/remote.js";
import { createAnthropicClient } from "../../sdk/client.js";
import { createAnthropicSessionClient } from "../../adapter/managed-agent/session-client.js";
import type { RuntimeStrategy } from "./strategy.js";
import { LocalRuntime } from "./local.js";
import { ManagedRuntime } from "./managed.js";

/**
 * Create the appropriate RuntimeStrategy for the given config.
 *
 * @param config - Loaded SpecRunnerConfig (must include runtime field)
 * @param cwd - Current working directory (repo root)
 * @param githubClient - GitHub API client
 * @param repo - Repository owner/name
 */
export function createRuntime(
  config: SpecRunnerConfig,
  cwd: string,
  githubClient: GitHubClient,
  repo: OriginInfo,
): RuntimeStrategy {
  if (config.runtime === "local") {
    return new LocalRuntime(cwd, githubClient);
  }

  // Managed runtime: create Anthropic + SessionClient
  const anthropicClient = createAnthropicClient(config.anthropic.apiKey);
  const sessionClient = createAnthropicSessionClient(anthropicClient);
  return new ManagedRuntime(cwd, sessionClient, githubClient, repo);
}
