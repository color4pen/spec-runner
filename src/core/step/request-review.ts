import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import {
  REQUEST_REVIEW_SYSTEM_PROMPT,
  buildRequestReviewInitialMessage,
} from "../../prompts/request-review-system.js";
import { requestReviewResultPath, requestMdPath, factCheckAttestationPath } from "../../util/paths.js";
import { hashRequestContent } from "../factcheck-attestation.js";
import { nextIteration } from "./io-iteration.js";
import { STEP_NAMES } from "./step-names.js";
import { REQUEST_REVIEW_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const REQUEST_REVIEW_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by RequestReviewStep.
 * request-review has its own dedicated Agent.
 * gitWrite: true — request-review-result file is committed and pushed by the agent.
 * Source code and request.md remain read-only (enforced by prompt).
 */
const requestReviewAgentDefinition: AgentDefinition = {
  name: "specrunner-request-review",
  role: STEP_NAMES.REQUEST_REVIEW,
  model: REQUEST_REVIEW_AGENT_MODEL,
  system: REQUEST_REVIEW_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(REQUEST_REVIEW_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * Compute the iteration number for the next request-review execution.
 */
function computeRequestReviewIteration(state: JobState): number {
  return (state.steps?.[STEP_NAMES.REQUEST_REVIEW]?.length ?? 0) + 1;
}

/**
 * RequestReviewStep: implements the request-review pipeline step.
 *
 * First step in the standard pipeline. Evaluates request.md before design runs.
 * Verdict: approve → design, needs-discussion → escalate, reject → escalate.
 *
 * Read-only: does NOT modify request.md or source files.
 * Result is written to request-review-result-NNN.md in the change folder.
 */
export const RequestReviewStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.REQUEST_REVIEW,

  agent: requestReviewAgentDefinition,

  toolHandlers: undefined,

  needsProjectContext: true,
  reportTool: REQUEST_REVIEW_REPORT_TOOL,

  // maxTurns: request-review is read-heavy with focused judgment; 15 is sufficient.
  maxTurns: 15,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: requestMdPath(deps.slug) },
    ];
  },

  writes(state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: requestReviewResultPath(deps.slug, nextIteration(state, STEP_NAMES.REQUEST_REVIEW)) },
      // Attestation is additional output; verify: false so the output-contract gate
      // does not halt when the agent omits it (e.g. degraded managed path).
      { path: factCheckAttestationPath(deps.slug), verify: false },
    ];
  },

  async enrichContext(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const content = await readFile(resolve(cwd, requestMdPath(slug)), "utf-8");
      const requestContentHash = hashRequestContent(content);
      return { ...dynamicContext, requestContentHash };
    } catch {
      // On any read error, return the context unchanged (degradation pattern).
      return dynamicContext;
    }
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeRequestReviewIteration(state);
    const findingsPath = requestReviewResultPath(deps.slug, iteration);
    return buildRequestReviewInitialMessage({
      slug: deps.slug,
      requestType: state.request.type,
      branch: state.branch ?? undefined,
      iteration,
      findingsPath,
      requestContentHash: deps.dynamicContext?.requestContentHash,
      attestationPath: deps.dynamicContext?.requestContentHash !== undefined
        ? factCheckAttestationPath(deps.slug)
        : undefined,
    });
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeRequestReviewIteration(state);
    return requestReviewResultPath(deps.slug, iteration);
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
