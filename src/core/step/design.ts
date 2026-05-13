import type { AgentStep, StepDeps } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { buildInitialMessage, DESIGN_SYSTEM_PROMPT } from "../../prompts/design-system.js";
import { getBranchPrefix } from "../../config/type-config.js";

const DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Full AgentDefinition owned by DesignStep.
 * Self-contained: name, role, model, system, and tools are all declared here.
 * Design D1: Step is the single source of truth for its agent definition.
 *
 * Note: register_branch tool has been removed (design D4).
 * Branch is created by CLI setupWorkspace() before the agent runs.
 */
const designAgentDefinition: AgentDefinition = {
  name: "specrunner-design",
  role: "design",
  model: DESIGN_AGENT_MODEL,
  system: DESIGN_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
};

/**
 * DesignStep: implements the design pipeline step as a plain Step object.
 *
 * Branch is created by CLI setupWorkspace() before the agent runs (design D4).
 * DesignStep is runtime-neutral and does not import any adapter code.
 *
 * No execution lifecycle here — StepExecutor owns that.
 */
export const DesignStep: AgentStep = {
  kind: "agent",
  name: "design",

  agent: designAgentDefinition,

  // toolHandlers intentionally omitted: injection is the adapter's responsibility (design D3).
  toolHandlers: undefined,

  // completionVerdict: design has no result file, so completion = unconditional success.
  // Used by executor local runtime path when resultContent is null.
  completionVerdict: "success",

  // maxTurns: design uses template-driven design (no openspec CLI tool calls); 15 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 15,

  // setsBranch: design creates the feature branch; executor sets state.branch after completion.
  // Design D2: declarative flag replaces step-name-based branch detection (TC-003 / TC-006).
  setsBranch: true,

  buildMessage(state: JobState, deps: StepDeps): string {
    // Use state.branch if already set by CLI (setupWorkspace early recording, D3).
    // Fall back to computing from type/slug/jobId for backward compatibility.
    const branch = state.branch
      ? state.branch
      : `${getBranchPrefix(deps.request.type)}${deps.slug}-${state.jobId.slice(0, 8)}`;
    return buildInitialMessage(deps.request.content, deps.slug, branch, deps.dynamicContext);
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // Design step does not produce a result file for verdict parsing
    // (branch is registered via SSE tool call, not a file)
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // Design has no file-based verdict — always returns null
    return NULL_PARSE_RESULT;
  },
};
