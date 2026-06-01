/**
 * bootstrap: shared CLI initialisation for create and resume commands.
 *
 * Encapsulates loadConfig → resolveGitHubToken → createGitHubClient → createRuntime.
 * Callers are responsible for resolving `repo` before calling bootstrap()
 * (each command obtains repo differently: create via getOriginInfo, resume via state).
 *
 * run.ts does NOT use bootstrap() — it uses preflight() which already returns config + repo.
 */
import { loadConfig } from "../config/store.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { createRuntime } from "../core/runtime/index.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import type { OriginInfo } from "../git/remote.js";
import type { RuntimeStrategy } from "../core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { GitHubClient } from "../core/port/github-client.js";

export interface BootstrapResult {
  config: SpecRunnerConfig;
  githubClient: GitHubClient;
  runtime: RuntimeStrategy;
  githubToken: string;
}

/**
 * Load config, resolve GitHub token, create GitHub client and runtime for the given working directory and repo.
 * Throws on config load failure or missing GitHub token — callers handle the error.
 */
export async function bootstrap(cwd: string, repo: OriginInfo): Promise<BootstrapResult> {
  const repoRoot = await resolveRepoRoot(cwd);
  const config = await loadConfig(repoRoot ?? undefined);
  const { token: githubToken } = await resolveGitHubToken(process.env as Record<string, string | undefined>);
  const githubClient = createGitHubClient(fetch, githubToken);
  const anthropicResult = config.runtime === "managed"
    ? await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>)
    : await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, { optional: true });
  const sessionClient = anthropicResult
    ? createAnthropicSessionClient(createAnthropicClient(anthropicResult.apiKey))
    : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken);
  return { config, githubClient, runtime, githubToken };
}
