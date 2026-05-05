import type { AgentStep, StepDeps } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { buildInitialMessage, PROPOSE_SYSTEM_PROMPT } from "../../prompts/propose-system.js";

const PROPOSE_AGENT_MODEL = "claude-sonnet-4-5";

/**
 * Full AgentDefinition owned by ProposeStep.
 * Self-contained: name, role, model, system, and tools are all declared here.
 * Design D1: Step is the single source of truth for its agent definition.
 *
 * Note: register_branch tool definition and handler are owned by ManagedAgentRunner
 * (src/adapter/managed-agent/tools/register-branch.ts). The adapter injects the
 * tool into the session at runtime (design D3). ProposeStep is runtime-neutral.
 */
const proposeAgentDefinition: AgentDefinition = {
  name: "specrunner-propose",
  role: "propose",
  model: PROPOSE_AGENT_MODEL,
  system: PROPOSE_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    // register_branch is injected by the adapter (ManagedAgentRunner / ClaudeCodeRunner)
    // per design D3. ProposeStep does not declare it here to remain runtime-neutral.
  ],
};

/**
 * ProposeStep: implements the propose pipeline step as a plain Step object.
 *
 * The register_branch Custom Tool is injected by the managed-agent adapter
 * (design D3). ProposeStep is runtime-neutral and does not import any adapter code.
 *
 * No execution lifecycle here — StepExecutor owns that.
 */
export const ProposeStep: AgentStep = {
  kind: "agent",
  name: "propose",

  agent: proposeAgentDefinition,

  // toolHandlers intentionally omitted: injection is the adapter's responsibility (design D3).
  toolHandlers: undefined,

  buildMessage(_state: JobState, deps: StepDeps): string {
    return buildInitialMessage(deps.request.content, deps.slug);
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // Propose step does not produce a result file for verdict parsing
    // (branch is registered via SSE tool call, not a file)
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // Propose has no file-based verdict — always returns null
    return NULL_PARSE_RESULT;
  },
};
