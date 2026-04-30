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
  /** GitHub client (port interface). Required for all pipeline steps. */
  githubClient: GitHubClient;
  /** Working directory for CLI steps (e.g. verification). Defaults to process.cwd(). */
  cwd?: string;
}
