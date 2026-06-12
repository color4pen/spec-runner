import type { AgentStep, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { OutputContract } from "../port/output-contract.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import type { TestPlacement } from "../../config/schema.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../prompts/implementer-system.js";
import { renderTestPlacementInstruction } from "../../prompts/test-placement.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const IMPLEMENTER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by ImplementerStep.
 * tools = [agent_toolset_20260401] — implementer reads files and writes code.
 * capabilities.gitWrite = true — implementer commits and pushes.
 */
const implementerAgentDefinition: AgentDefinition = {
  name: "specrunner-implementer",
  role: STEP_NAMES.IMPLEMENTER,
  model: IMPLEMENTER_AGENT_MODEL,
  system: IMPLEMENTER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
  capabilities: {
    gitWrite: true,
  },
};

/**
 * Build the initial user message for the implementer session.
 *
 * When dynamicContext is provided and has gitLog or diffStat, a branch context
 * section is prepended so the agent understands what has already been done on
 * the branch without having to run git commands itself.
 *
 * When placement is provided, a deterministic test file placement directive is
 * appended, overriding the default "follow existing placement pattern" guidance.
 * When placement is absent, the message is identical to the pre-change behavior.
 */
export function buildImplementerInitialMessage(opts: {
  slug: string;
  branch: string;
  requestContent: string;
  dynamicContext?: DynamicContext;
  placement?: TestPlacement;
}): string {
  const { slug, branch, requestContent, dynamicContext, placement } = opts;

  const contextLines: string[] = [];
  if (dynamicContext?.gitLog) {
    contextLines.push(`## Branch Context\n\n### Recent commits (main..HEAD)\n\n\`\`\`\n${dynamicContext.gitLog}\n\`\`\``);
  }
  if (dynamicContext?.diffStat) {
    contextLines.push(`### Diff stat (main..HEAD)\n\n\`\`\`\n${dynamicContext.diffStat}\n\`\`\``);
  }
  const contextSection = contextLines.length > 0
    ? `\n\n${contextLines.join("\n\n")}`
    : "";

  const placementSection = placement
    ? `\n\n${renderTestPlacementInstruction(placement)}`
    : "";

  return `<user-request>
You are the implementer for the following change:

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}

Please:
1. Read ${changeFolderPath(slug)}/tasks.md to understand what needs to be implemented
2. Read the relevant specs/ files for detailed specifications
3. Implement all tasks in tasks.md (TDD: write tests first where applicable)
4. Update tasks.md: mark completed tasks with [x]
5. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。

Original request:
${requestContent}
</user-request>${contextSection}${placementSection}`;
}

/**
 * ImplementerStep: implements the implementer pipeline step.
 *
 * Has its own dedicated AgentDefinition (role: "implementer").
 * No custom tool handlers — implementer uses the standard agent toolset.
 * No result file — completion detected via polling (session idle).
 * completionVerdict: "success" — session completion maps to "success" for transitions.
 */
export const ImplementerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.IMPLEMENTER,

  agent: implementerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  needsProjectContext: true,
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: implementer handles complex multi-file tasks; 60 is the upper bound.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 60,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/tasks.md` },
      { path: `${folder}/spec.md` },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: changeFolderPath(deps.slug), artifact: "gitState" },
      // tasks.md is validated via outputContracts (tasks-complete) rather than produced.
      // It already exists as a scaffold from the design step — overwrite alone is not sufficient;
      // we need to verify that all checkboxes are marked [x].
      { path: `${changeFolderPath(deps.slug)}/tasks.md`, verify: false },
    ];
  },

  outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
    return [
      {
        kind: "tasks-complete",
        path: `${changeFolderPath(deps.slug)}/tasks.md`,
        policy: "follow-up",
      },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.IMPLEMENTER);
    return buildImplementerInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      requestContent: deps.request.content,
      dynamicContext: deps.dynamicContext,
      placement: deps.config.tests?.placement,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // implementer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
