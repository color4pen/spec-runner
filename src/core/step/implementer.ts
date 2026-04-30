import type { AgentStep } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../prompts/implementer-system.js";
import { buildGitPushInstruction } from "../../prompts/git-push-instruction.js";

const IMPLEMENTER_AGENT_MODEL = "claude-sonnet-4-5";

/**
 * Full AgentDefinition owned by ImplementerStep.
 * tools = [agent_toolset_20260401] — implementer reads files and writes code.
 * capabilities.gitWrite = true — implementer commits and pushes.
 */
const implementerAgentDefinition: AgentDefinition = {
  name: "specrunner-implementer",
  role: "implementer",
  model: IMPLEMENTER_AGENT_MODEL,
  system: IMPLEMENTER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
  capabilities: {
    gitWrite: true,
  },
};

/**
 * Build the initial user message for the implementer session.
 */
function buildImplementerInitialMessage(opts: {
  slug: string;
  branch: string;
  requestContent: string;
}): string {
  const { slug, branch, requestContent } = opts;
  return `<user-request>
You are the implementer for the following change:

Change folder: openspec/changes/${slug}
Branch: ${branch}

Please:
1. Read openspec/changes/${slug}/tasks.md to understand what needs to be implemented
2. Read the relevant specs/ files for detailed specifications
3. Implement all tasks in tasks.md (TDD: write tests first where applicable)
4. Update tasks.md: mark completed tasks with [x]
5. ${buildGitPushInstruction(branch)}

Original request:
${requestContent}
</user-request>`;
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
  name: "implementer",

  agent: implementerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",

  buildMessage(state: JobState, deps: StepDeps): string {
    const branch = state.branch ?? "main";
    return buildImplementerInitialMessage({
      slug: deps.slug,
      branch,
      requestContent: deps.request.content,
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
