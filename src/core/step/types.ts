import type { JobState } from "../../state/schema.js";
import type { StepContext } from "../types.js";
import type { CustomToolHandler } from "../tools/types.js";
import type { AgentDefinition } from "../agent/definition.js";
import type { ReviewScores } from "../parser/review-scores.js";
import type { FindingSeverityCounts } from "../parser/review-findings.js";
import type { DynamicContext } from "../../git/dynamic-context.js";

// Re-export AgentDefinition for convenience
export type { AgentDefinition };

/**
 * Dependencies injected into Step methods (buildMessage, resultFilePath, parseResult).
 * Aliased to StepContext — the minimal set of fields Step implementations actually need.
 *
 * Design D2 (stepcontext-type-separation): StepDeps = StepContext (was PipelineDeps).
 * Callers that pass PipelineDeps remain valid because PipelineDeps extends StepContext.
 */
export type StepDeps = StepContext;

/**
 * The outcome of a successful step execution, as returned by parseResult.
 * Used by StepExecutor to record the StepRun.
 */
export interface ParsedStepResult {
  verdict: import("../../state/schema.js").Verdict | null;
  findingsPath: string | null;
  fileContent?: string | null;
  /**
   * Structured scores extracted from the agent's review output.
   * Only set by CodeReviewStep when the agent outputs a Scores table.
   * Optional — other steps leave this undefined.
   *
   * D2: scores is optional; existing steps are unaffected.
   */
  scores?: ReviewScores & Pick<FindingSeverityCounts, "critical" | "high">;
  /**
   * PR info extracted by PrCreateStep. Other steps leave this undefined.
   * StepExecutor.finalizeStep() reflects this into state.pullRequest when present.
   */
  pullRequest?: { url: string; number: number; createdAt: string };
}

// Re-export for convenience so consumers don't need to import from parser directly.
export type { ReviewScores, FindingSeverityCounts };

/**
 * NULL_PARSE_RESULT: shared constant for steps that have no file-based verdict.
 * Used by propose, spec-fixer, implementer, and build-fixer.
 */
export const NULL_PARSE_RESULT: ParsedStepResult = {
  verdict: null,
  findingsPath: null,
  fileContent: null,
};

/**
 * AgentStep: a pipeline step that uses a managed Anthropic agent session.
 * kind: "agent" — StepExecutor creates and polls a session.
 */
export interface AgentStep {
  kind: "agent";
  /** Canonical name of this step (e.g. "design", "spec-review"). Must match agent.role. */
  name: string;
  /** Full agent definition used by this step. Owned by the Step implementation. */
  agent: AgentDefinition;
  /**
   * Custom tool handlers scoped to this step.
   * Key = tool name (e.g. "register_branch"), Value = handler function.
   * Optional — steps that have no custom tools omit this field.
   */
  toolHandlers?: Map<string, CustomToolHandler>;
  /**
   * Build the initial user message content for this step.
   * Pure function — no I/O allowed.
   */
  buildMessage(state: JobState, deps: StepDeps): string;
  /**
   * Compute the path of the result file written by the agent for this step.
   * Returns null if no result file is expected.
   */
  resultFilePath(state: JobState, deps: StepDeps): string | null;
  /**
   * Parse the result file content into a step outcome.
   * Pure function — no I/O allowed.
   */
  parseResult(content: string, deps: StepDeps): ParsedStepResult;

  /**
   * Verdict to record when resultFilePath is null and the session completes successfully.
   * Defaults to "approved" if omitted (preserves spec-fixer → spec-review loop behavior).
   * Set to "success" for agent steps where completion = unconditional forward progress
   * (e.g. implementer, build-fixer).
   */
  completionVerdict?: import("../../state/schema.js").Verdict;

  /**
   * If true, StepExecutor verifies the branch HEAD SHA advanced during the session.
   * The check fetches the remote HEAD before and after the session via GitHubClient;
   * if the SHA is unchanged, the executor throws NO_COMMIT_DETECTED.
   *
   * Set to true on writing-agent steps (spec-fixer, implementer, build-fixer, code-fixer)
   * where the agent's responsibility includes producing a commit + push. Leave false
   * (or omit) on review-style steps that may legitimately produce no commit beyond
   * the result file (which is verified separately via parseResult).
   *
   * This is a stopgap mechanical guard against the failure mode where an agent ends
   * its turn without committing — bypassing the agent's prompt-following.
   */
  requiresCommit?: boolean;

  /**
   * Maximum number of turns for the SDK query() call.
   * When set, ClaudeCodeRunner passes this value as options.maxTurns to the SDK.
   * When absent, the default of 30 is used.
   * Design D3 (propose-openspec-cli-and-step-model-config): per-step maxTurns configuration.
   */
  maxTurns?: number;

  /**
   * Compute maxTurns dynamically based on runtime state.
   * When defined and returns a number, this value is used as the step-level
   * default (priority 3 in the resolution chain) instead of step.maxTurns.
   * When undefined or returns undefined, step.maxTurns is used as fallback.
   */
  getMaxTurns?(state: JobState): number | undefined;

  /**
   * If true, StepExecutor sets state.branch after this step completes (local runtime path only).
   * Used for steps that create the feature branch as a side effect of their execution
   * (e.g., propose). The branch is set to `feat/${slug}` if state.branch is not already set.
   *
   * This flag replaces any step-name-based branch detection logic, enabling declarative
   * branch setup without hardcoding step names in executor.ts (TC-006 / TC-003).
   *
   * Only applies when state.branch is absent at the time of step completion.
   * If state.branch is already set, this flag has no effect.
   */
  setsBranch?: boolean;

  /**
   * Enrich dynamic context with step-specific data before buildMessage is called.
   * Async — I/O is allowed (unlike buildMessage which is pure).
   * Returns a new DynamicContext with additional fields populated.
   * When absent, adapter skips enrichment and uses the original dynamicContext as-is.
   *
   * Design D1 (add-spec-review-baseline-check): optional hook for I/O-heavy context
   * preparation that cannot be done inside buildMessage (pure function constraint).
   */
  enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;
}

/**
 * CliStep: a pipeline step that runs directly without a managed agent session.
 * kind: "cli" — StepExecutor calls step.run() and reads resultFilePath.
 * No agent field — CLI-resident steps (like verification) have no associated Agent.
 */
export interface CliStep {
  kind: "cli";
  /** Canonical name of this step (e.g. "verification"). */
  name: string;
  /**
   * Execute the CLI step (spawn processes, write result files, etc.).
   * StepExecutor calls this instead of creating a session.
   */
  run(state: JobState, deps: StepDeps): Promise<void>;
  /**
   * Compute the path of the result file written by this step.
   * Unlike AgentStep, this is non-null (CLI steps always produce a result file).
   */
  resultFilePath(state: JobState, deps: StepDeps): string;
  /**
   * Parse the result file content into a step outcome.
   * Pure function — no I/O allowed.
   */
  parseResult(content: string, deps: StepDeps): ParsedStepResult;
}

/**
 * Step is a discriminated union of AgentStep and CliStep.
 * Use step.kind to determine which variant you have.
 *
 * Design D1: explicit discriminator rather than null agent / name-based inference.
 * Design D2: plain TypeScript interface (not abstract class).
 */
export type Step = AgentStep | CliStep;
