/**
 * createRuntime: factory for RuntimeFacade.
 *
 * Design D4: ALL config.runtime branching is confined to this function.
 * The sessionClient for managed runtime is provided by the CLI layer (DI),
 * so the responsibility is shared between this factory and src/cli/ callers.
 * No other code in the codebase (except src/config/ schema and src/cli/rm.ts)
 * should branch on config.runtime.
 *
 * T-05: factory now accepts nullable githubClient (null = GitHub integration disabled).
 * managed × disabled → GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME (fail-fast before job state).
 */
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { GitHubClient } from "../port/github-client.js";
import type { OriginInfo } from "../../git/remote.js";
import type { SessionClient } from "../port/session-client.js";
import type { RuntimeFacade } from "../runtime-facade.js";
import { LocalRuntime } from "./local.js";
import { ManagedRuntime } from "./managed.js";
import { spawnBackground } from "../../util/spawn.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

export type { RuntimeFacade };

export interface CreateRuntimeOptions {
  /** Whether GitHub integration is enabled for this job. */
  githubEnabled?: boolean;
}

/**
 * Create the appropriate RuntimeFacade for the given config.
 *
 * @param config - Loaded SpecRunnerConfig (must include runtime field)
 * @param cwd - Current working directory (repo root)
 * @param githubClient - GitHub API client, or null when integration is disabled
 * @param repo - Repository owner/name, or null when integration is disabled
 * @param sessionClient - Pre-built SessionClient (required for managed runtime)
 * @param githubToken - Resolved GitHub token. undefined when integration is disabled
 * @param opts - Additional options (githubEnabled flag for managed guard)
 */
export function createRuntime(
  config: SpecRunnerConfig,
  cwd: string,
  githubClient: GitHubClient | null,
  repo: OriginInfo | null,
  sessionClient: SessionClient | undefined,
  githubToken: string | undefined,
  opts?: CreateRuntimeOptions,
): RuntimeFacade {
  const githubEnabled = opts?.githubEnabled ?? (githubClient !== null);

  if (config.runtime === "local") {
    return new LocalRuntime({
      cwd,
      githubClient,
      githubToken,
      owner: repo?.owner,
      repo: repo?.name,
      workspaceSetup: config.workspace?.setup,
      spawnBackgroundFn: spawnBackground,
    });
  }

  // Managed runtime: sessionClient must be injected by the caller
  if (!sessionClient) {
    throw new Error("sessionClient is required for managed runtime");
  }

  // B-8: managed × GitHub disabled is rejected here (the only place for runtime branching).
  if (!githubEnabled) {
    throw new SpecRunnerError(
      ERROR_CODES.GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME,
      "managed runtime requires GitHub integration. Set github.enabled: true or switch to runtime: local.",
      "managed runtime は GitHub 連携が必要です。",
    );
  }

  // At this point githubEnabled is true: githubToken is guaranteed non-null by the caller.
  return new ManagedRuntime(cwd, sessionClient, githubClient!, repo!, undefined, githubToken!);
}
