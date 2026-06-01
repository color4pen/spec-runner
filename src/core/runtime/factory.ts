/**
 * createRuntime: factory for RuntimeStrategy.
 *
 * Design D4: ALL config.runtime branching is confined to this function.
 * The sessionClient for managed runtime is provided by the CLI layer (DI),
 * so the responsibility is shared between this factory and src/cli/ callers.
 * No other code in the codebase (except src/config/ schema and src/cli/rm.ts)
 * should branch on config.runtime.
 */
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { GitHubClient } from "../port/github-client.js";
import type { OriginInfo } from "../../git/remote.js";
import type { SessionClient } from "../port/session-client.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { LocalRuntime } from "./local.js";
import { ManagedRuntime } from "./managed.js";

/**
 * Create the appropriate RuntimeStrategy for the given config.
 *
 * @param config - Loaded SpecRunnerConfig (must include runtime field)
 * @param cwd - Current working directory (repo root)
 * @param githubClient - GitHub API client
 * @param repo - Repository owner/name
 * @param sessionClient - Pre-built SessionClient (required for managed runtime)
 * @param githubToken - Resolved GitHub token (for managed agent session creation)
 */
export function createRuntime(
  config: SpecRunnerConfig,
  cwd: string,
  githubClient: GitHubClient,
  repo: OriginInfo,
  sessionClient: SessionClient | undefined,
  githubToken: string,
): RuntimeStrategy {
  if (config.runtime === "local") {
    return new LocalRuntime({ cwd, githubClient, githubToken, owner: repo.owner, repo: repo.name });
  }

  // Managed runtime: sessionClient must be injected by the caller
  if (!sessionClient) {
    throw new Error("sessionClient is required for managed runtime");
  }
  return new ManagedRuntime(cwd, sessionClient, githubClient, repo, undefined, githubToken);
}
