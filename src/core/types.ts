import type { SessionClient } from "./port/session-client.js";
import type { GitHubClient } from "./port/github-client.js";
import type { AgentRunner } from "./port/agent-runner.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";
import type { DynamicContext } from "../git/dynamic-context.js";

/**
 * Minimal context required by Step methods (buildMessage, resultFilePath, parseResult).
 * Contains only the fields that Step implementations actually access.
 *
 * Design D1 (stepcontext-type-separation): StepContext is a supertype of PipelineDeps.
 * PipelineDeps extends StepContext to maintain backward compatibility (Liskov substitution).
 *
 * cwd is optional; when absent, consumers SHALL fall back to process.cwd().
 */
export interface StepContext {
  config: SpecRunnerConfig;
  slug: string;
  /** Working directory for CLI steps (e.g. verification). Defaults to process.cwd(). */
  cwd?: string;
  request: ParsedRequest;
  repo: OriginInfo;
  /** Dynamic repository context injected at pipeline start. Optional for backward compat. */
  dynamicContext?: DynamicContext;
}

/**
 * Dependencies injected into all pipeline steps.
 * Defined here (not in pipeline.ts) to break potential circular imports
 * between pipeline.ts ↔ loop.ts ↔ steps/*.ts.
 *
 * Extends StepContext so that PipelineDeps can be passed anywhere StepContext is expected.
 * Design D1 (stepcontext-type-separation): PipelineDeps extends StepContext.
 */
export interface PipelineDeps extends StepContext {
  /**
   * Managed-agent session client. Required for "managed" runtime.
   * Optional when runtime === "local" (ClaudeCodeRunner does not need it).
   * Design D8: composition root injects the appropriate AgentRunner based on runtime config.
   * Note: client is maintained for backward compatibility; after runner is added,
   * pipeline steps use runner directly. client will be removed in a future cleanup request.
   */
  client?: SessionClient;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /** GitHub client (port interface). Required for all pipeline steps. */
  githubClient: GitHubClient;
  /**
   * Pre-built AgentRunner injected by RuntimeStrategy.buildDeps().
   * createStandardPipeline and runProposePipeline use this directly,
   * eliminating the config.runtime branch in pipeline/run.ts.
   * Design D8: runner replaces runtime-specific AgentRunner construction in pipeline.
   */
  runner?: AgentRunner;
}
