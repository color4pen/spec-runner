import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { CustomToolHandler } from "../tools/types.js";
import type { AgentDefinition } from "../agent/definition.js";

// Re-export AgentDefinition for convenience
export type { AgentDefinition };

/**
 * Dependencies injected into Step.buildMessage.
 * Identical to PipelineDeps for now; can narrow in the future.
 */
export type StepDeps = PipelineDeps;

/**
 * The outcome of a successful step execution, as returned by parseResult.
 * Used by StepExecutor to record the StepRun.
 */
export interface ParsedStepResult {
  verdict: import("../../state/schema.js").Verdict | null;
  findingsPath: string | null;
  fileContent?: string | null;
}

/**
 * Step is a pure declaration of a single pipeline step.
 * It holds NO execution state — StepExecutor owns the lifecycle.
 *
 * Design D2: plain TypeScript interface (not abstract class).
 * Design D1: agent is a complete AgentDefinition (not a runtime placeholder).
 */
export interface Step {
  /** Canonical name of this step (e.g. "propose", "spec-review"). Must match agent.role. */
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
}
