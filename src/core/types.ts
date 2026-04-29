import type { SessionClient } from "./port/session-client.js";
import type { GitHubClient } from "./port/github-client.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

/**
 * Dependencies injected into all pipeline steps.
 * Defined here (not in pipeline.ts) to break potential circular imports
 * between pipeline.ts ↔ loop.ts ↔ steps/*.ts.
 */
export interface PipelineDeps {
  client: SessionClient;
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  slug: string;
  timeoutMs?: number;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /**
   * @deprecated Use githubClient instead.
   * Injectable fetch for GitHub API (kept for backward compat with tests)
   */
  githubFetch?: typeof fetch;
  /**
   * Optional GitHub client (port interface).
   * When not provided, executor constructs one from githubFetch + config.github.accessToken.
   */
  githubClient?: GitHubClient;
}
