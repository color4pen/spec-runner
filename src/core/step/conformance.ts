import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../../prompts/conformance-system.js";
import { conformanceResultPath, changeFolderPath, requestMdPath } from "../../util/paths.js";
import { nextIteration } from "./io-iteration.js";
import { STEP_NAMES } from "./step-names.js";
import { JUDGE_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const CONFORMANCE_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Full AgentDefinition owned by ConformanceStep.
 * conformance has its own dedicated Agent — does NOT reuse any other Agent.
 * tools = [] because conformance only reads files and writes results (no custom tools).
 * gitWrite: true — conformance-result file is committed and pushed by the agent to origin.
 * Source code remains read-only (enforced by prompt: "Do NOT modify any source files").
 */
const conformanceAgentDefinition: AgentDefinition = {
  name: "specrunner-conformance",
  role: STEP_NAMES.CONFORMANCE,
  model: CONFORMANCE_AGENT_MODEL,
  system: CONFORMANCE_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(JUDGE_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * Compute the iteration number for the next conformance push.
 */
function computeConformanceIteration(state: JobState): number {
  return (state.steps?.[STEP_NAMES.CONFORMANCE]?.length ?? 0) + 1;
}

/**
 * ConformanceStep: implements the conformance pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "conformance").
 * No custom tool handlers — conformance has no Custom Tools.
 * Verdict is parsed from a result file written to the branch by the agent.
 * Placed after code-review in the pipeline; only approved result proceeds to adr-gen.
 */
export const ConformanceStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.CONFORMANCE,

  agent: conformanceAgentDefinition,

  // No custom tool handlers for conformance
  toolHandlers: undefined,

  needsProjectContext: true,
  reportTool: JUDGE_REPORT_TOOL,

  // maxTurns: conformance is read-heavy with focused judgment; 15 is sufficient.
  // Same as spec-review (read + judgment only).
  maxTurns: 15,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/tasks.md` },
      { path: `${folder}/design.md` },
      { path: `${folder}/spec.md` },
      { path: requestMdPath(deps.slug) },
    ];
  },

  writes(state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: conformanceResultPath(deps.slug, nextIteration(state, STEP_NAMES.CONFORMANCE)) },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeConformanceIteration(state);
    const findingsPath = conformanceResultPath(deps.slug, iteration);
    const changeFolder = changeFolderPath(deps.slug);

    return `<user-request>
Please perform a conformance review for the following change:

Change folder: ${changeFolder}
Iteration: ${iteration}

Steps:
1. Read ${changeFolder}/rules.md (identity priming)
2. Read ${changeFolder}/tasks.md — verify all checkboxes are marked complete [x]
3. Read ${changeFolder}/design.md — note all design decisions (D1, D2, ...)
4. Read ${changeFolder}/spec.md — note all Requirements (SHALL/MUST) and Scenarios
5. Read ${changeFolder}/request.md — note all acceptance criteria
6. Run \`git diff main...HEAD --stat\` to understand the scope of implementation changes
7. Review the implementation against all 4 judgment items
8. Write your findings and verdict to: ${findingsPath}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

Original request:
${deps.request.content}
</user-request>

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeConformanceIteration(state);
    return conformanceResultPath(deps.slug, iteration);
  },

  parseResult(content: string, _deps: StepDeps): ParsedStepResult {
    // R4 (contract lock): prose-verdict parse path is dead (executor uses typed toolResult).
    // parseResult is kept to satisfy the Step interface; verdict: null triggers escalation fallback
    // in the prose path, which is only reached by CLI steps without reportTool.
    return {
      verdict: null,
      findingsPath: null,
      fileContent: content,
    };
  },
};
