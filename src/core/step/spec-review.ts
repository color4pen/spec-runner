import type { AgentStep, StepDeps, ParsedStepResult } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState, Verdict } from "../../state/schema.js";
import { SPEC_REVIEW_SYSTEM_PROMPT, buildSpecReviewInitialMessage } from "../../prompts/spec-review-system.js";
import { parseReviewVerdict } from "../parser/review-verdict.js";
import { getSpecReviewMode } from "../../config/type-config.js";
import { specReviewResultPath } from "../../util/paths.js";

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
  role: "spec-review",
  model: SPEC_REVIEW_AGENT_MODEL,
  system: SPEC_REVIEW_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
  capabilities: { gitWrite: true },
};

/**
 * Parse the verdict from a spec-review-result.md file content.
 * Delegates to the shared parseReviewVerdict helper (Design D5).
 * Returns the first matched verdict (first-write-wins).
 */
export function parseSpecReviewVerdict(content: string): Verdict | null {
  return parseReviewVerdict(content);
}

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
  return (state.steps?.["spec-review"]?.length ?? 0) + 1;
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
  name: "spec-review",

  agent: specReviewAgentDefinition,

  // No custom tool handlers for spec-review
  toolHandlers: undefined,

  // maxTurns: spec-review is read-heavy with focused judgment; 15 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 15,

  getMaxTurns(state: JobState): number | undefined {
    const mode = getSpecReviewMode(state.request.type);
    return mode === "lightweight" ? 10 : undefined;
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeSpecReviewIteration(state);
    const findingsPath = buildFindingsPath(deps.slug, iteration);
    return buildSpecReviewInitialMessage({
      slug: deps.slug,
      repository: `${deps.repo.owner}/${deps.repo.name}`,
      requestType: state.request.type,
      enabled: deps.request.enabled,
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

  parseResult(content: string, _deps: StepDeps): ParsedStepResult {
    const verdict = parseSpecReviewVerdict(content);
    return {
      verdict: verdict ?? "escalation",
      findingsPath: null, // filled in by StepExecutor after fetch
      fileContent: content,
    };
  },
};

