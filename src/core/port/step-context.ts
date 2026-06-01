import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import type { GitHubClient } from "../../kernel/github-client.js";

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
  /** Dynamic repository context injected at pipeline start. Optional for backward compat. */
  dynamicContext?: DynamicContext;
  /** Resolved GitHub token. Optional for backward compat. */
  githubToken?: string;
  /** GitHub REST API client. Optional in StepContext; required in PipelineDeps. */
  githubClient?: GitHubClient;
  /** GitHub repository owner (e.g. "octocat"). Optional in StepContext; required in PipelineDeps. */
  owner?: string;
  /** GitHub repository name (e.g. "my-repo"). Optional in StepContext; required in PipelineDeps. */
  repo?: string;
}
