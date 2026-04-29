import type Anthropic from "@anthropic-ai/sdk";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

/**
 * Dependencies injected into all pipeline steps.
 * Defined here (not in pipeline.ts) to break potential circular imports
 * between pipeline.ts ↔ loop.ts ↔ steps/*.ts.
 */
export interface PipelineDeps {
  client: Anthropic;
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  slug: string;
  timeoutMs?: number;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable fetch for GitHub API */
  githubFetch?: typeof fetch;
}
