import type { AgentStep, StepDeps } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { buildInitialMessage, PROPOSE_SYSTEM_PROMPT } from "../../prompts/propose-system.js";

const PROPOSE_AGENT_MODEL = "claude-opus-4-6[1m]";

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

  // completionVerdict: propose has no result file, so completion = unconditional success.
  // Used by executor local runtime path when resultContent is null.
  completionVerdict: "success",

  // maxTurns: propose involves design exploration via openspec CLI; 20 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 20,

  // setsBranch: propose creates the feature branch; executor sets state.branch after completion.
  // Design D2: declarative flag replaces step-name-based branch detection (TC-003 / TC-006).
  setsBranch: true,

  buildMessage(state: JobState, deps: StepDeps): string {
    const branch = `feat/${deps.slug}-${state.jobId.slice(0, 8)}`;
    return buildInitialMessage(deps.request.content, deps.slug, branch);
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
