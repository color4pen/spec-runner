import type { AgentStep, StepDeps } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../prompts/spec-fixer-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath, specReviewResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";

const SPEC_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by SpecFixerStep.
 * tools = [] — spec-fixer has no Custom Tools.
 * Design D8: Tool spec ownership is co-located with the Step.
 */
const specFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-spec-fixer",
  role: STEP_NAMES.SPEC_FIXER,
  model: SPEC_FIXER_AGENT_MODEL,
  system: SPEC_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
};

/**
 * Build the initial user message for the spec-fixer session.
 * Wraps user-controlled content in XML delimiters for prompt injection protection.
 */
function buildSpecFixerInitialMessage(opts: {
  slug: string;
  branch: string;
  findingsPath: string;
}): string {
  const { slug, branch, findingsPath } = opts;
  return `<user-request>
You are the spec-fixer for the following change:

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}
Findings file: ${findingsPath}

Please:
1. Read the findings file at ${findingsPath}
2. For each finding, implement the fix described in the "How to Fix" column
3. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
4. Do NOT modify the spec-review-result.md file itself

If any finding cannot be fixed, add a comment at the end of design.md:
<!-- spec-fixer-deferred: [finding number] [reason] -->
</user-request>`;
}

/**
 * SpecFixerStep: implements the spec-fixer pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "spec-fixer").
 * No custom tool handlers — spec-fixer has no Custom Tools.
 * No result file — spec-fixer completion is determined by polling.
 */
export const SpecFixerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.SPEC_FIXER,

  agent: specFixerAgentDefinition,

  // No custom tool handlers for spec-fixer
  toolHandlers: undefined,

  phase: "spec",

  // completionVerdict: "approved" — spec-fixer has no result file; polling completion
  // maps to "approved" (enabling spec-fixer → spec-review loop via transition table).
  completionVerdict: "approved",

  requiresCommit: true,

  // maxTurns: spec-fixer applies findings mechanically; 25 covers multi-finding fix cycles.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 25,

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.SPEC_FIXER);
    const specReviewResult = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW);
    const findingsPath = specReviewResult?.findingsPath ?? specReviewResultPath(deps.slug, 1);
    return buildSpecFixerInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      findingsPath,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // spec-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // spec-fixer has no file-based verdict
    return NULL_PARSE_RESULT;
  },
};
