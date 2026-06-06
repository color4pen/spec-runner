import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { SPEC_REVIEW_SYSTEM_PROMPT, buildSpecReviewInitialMessage } from "../../prompts/spec-review-system.js";
import { getSpecReviewMode } from "../../config/type-config.js";
import { specReviewResultPath, changeFolderPath } from "../../util/paths.js";
import { nextIteration } from "./io-iteration.js";
import { STEP_NAMES } from "./step-names.js";
import { JUDGE_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const SPEC_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Full AgentDefinition owned by SpecReviewStep.
 * spec-review has its own dedicated Agent — does NOT reuse the propose Agent.
 * tools = [] because spec-review only reads files and writes results (no custom tools).
 * gitWrite: true — spec-review-result file is committed and pushed by the agent to origin.
 * Source code remains read-only (enforced by prompt: "Do NOT modify any source files").
 * Managed Agents require agent-driven push; orchestrator cannot access agent workspace.
 * Design D5: STEP_AGENT_ROLE lookup removed; each Step owns its role directly.
 */
const specReviewAgentDefinition: AgentDefinition = {
  name: "specrunner-spec-review",
  role: STEP_NAMES.SPEC_REVIEW,
  model: SPEC_REVIEW_AGENT_MODEL,
  system: SPEC_REVIEW_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(JUDGE_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * Build the findings file path for a given iteration.
 * Delegates to specReviewResultPath from util/paths.ts.
 * Re-exported here for backward compatibility with callers that import from this module.
 */
export function buildFindingsPath(slug: string, iteration: number): string {
  return specReviewResultPath(slug, iteration);
}

/**
 * Compute the iteration number for the next spec-review push.
 */
function computeSpecReviewIteration(state: JobState): number {
  return (state.steps?.[STEP_NAMES.SPEC_REVIEW]?.length ?? 0) + 1;
}

/**
 * SpecReviewStep: implements the spec-review pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "spec-review").
 * No custom tool handlers — spec-review has no Custom Tools.
 * Verdict is parsed from a result file written to the branch by the agent.
 */
export const SpecReviewStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.SPEC_REVIEW,

  agent: specReviewAgentDefinition,

  // No custom tool handlers for spec-review
  toolHandlers: undefined,

  needsProjectContext: true,
  reportTool: JUDGE_REPORT_TOOL,

  // maxTurns: spec-review is read-heavy with focused judgment; 15 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 15,

  getMaxTurns(state: JobState): number | undefined {
    const mode = getSpecReviewMode(state.request.type);
    return mode === "lightweight" ? 10 : undefined;
  },

  reads(state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/spec.md` },
      { path: `${folder}/design.md` },
      { path: `${folder}/tasks.md` },
    ];
  },

  writes(state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: specReviewResultPath(deps.slug, nextIteration(state, STEP_NAMES.SPEC_REVIEW)) },
    ];
  },

  async enrichContext(dynamicContext: DynamicContext, _cwd: string, _slug: string): Promise<DynamicContext> {
    return dynamicContext;
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeSpecReviewIteration(state);
    const findingsPath = buildFindingsPath(deps.slug, iteration);
    return buildSpecReviewInitialMessage({
      slug: deps.slug,
      requestType: state.request.type,
      requestContent: deps.request.content,
      branch: state.branch ?? undefined,
      iteration,
      findingsPath,
      specReviewMode: getSpecReviewMode(state.request.type),
    });
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeSpecReviewIteration(state);
    return buildFindingsPath(deps.slug, iteration);
  },

  parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
    // R4 (contract lock): prose-verdict parse path is dead (executor uses typed toolResult).
    // parseResult is kept to satisfy the Step interface; verdict: null triggers escalation fallback
    // in the prose path, which is only reached by CLI steps without reportTool.
    return {
      verdict: null,
      findingsPath: null,
    };
  },
};

