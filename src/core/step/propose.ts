import type { Step, StepDeps, ParsedStepResult } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { registerBranchTool } from "../tools/register-branch.js";
import { buildInitialMessage, PROPOSE_SYSTEM_PROMPT } from "../../prompts/propose-system.js";

const PROPOSE_AGENT_MODEL = "claude-sonnet-4-5";

/**
 * Full AgentDefinition owned by ProposeStep.
 * Self-contained: name, role, model, system, and tools are all declared here.
 * Design D1: Step is the single source of truth for its agent definition.
 */
const proposeAgentDefinition: AgentDefinition = {
  name: "specrunner-propose",
  role: "propose",
  model: PROPOSE_AGENT_MODEL,
  system: PROPOSE_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    // register_branch is co-located in this file's toolHandlers below
    {
      type: "custom",
      name: registerBranchTool.definition.name,
      description: registerBranchTool.definition.description,
      input_schema: registerBranchTool.definition.input_schema,
    },
  ],
};

/**
 * ProposeStep: implements the propose pipeline step as a plain Step object.
 *
 * Owns the register_branch Custom Tool handler (co-located per D4).
 * No execution lifecycle here — StepExecutor owns that.
 */
export const ProposeStep: Step = {
  name: "propose",

  agent: proposeAgentDefinition,

  /**
   * register_branch handler is exclusively owned by ProposeStep.
   * spec-review and spec-fixer do NOT have this handler.
   */
  toolHandlers: new Map([["register_branch", registerBranchTool.handler]]),

  buildMessage(_state: JobState, deps: StepDeps): string {
    return buildInitialMessage(deps.request.content);
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // Propose step does not produce a result file for verdict parsing
    // (branch is registered via SSE tool call, not a file)
    return null;
  },

  parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
    // Propose has no file-based verdict — always returns null
    return {
      verdict: null,
      findingsPath: null,
      fileContent: null,
    };
  },
};
