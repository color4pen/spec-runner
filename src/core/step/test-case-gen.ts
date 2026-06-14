import type { AgentStep, StepDeps, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT, buildTestCaseGenInitialMessage } from "../../prompts/test-case-gen-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const TEST_CASE_GEN_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by TestCaseGenStep.
 * test-case-gen has its own dedicated Agent — reads design.md/tasks.md, writes test-cases.md.
 * tools = [agent_toolset_20260401] — needs file read/write and git access.
 * capabilities.gitWrite = true — test-cases.md is committed and pushed by the agent.
 *
 * Design D1 (add-test-case-generation-step): completionVerdict type step.
 * Design D2: claude-sonnet-4-6 — design-reading task; Opus is overkill.
 */
const testCaseGenAgentDefinition: AgentDefinition = {
  name: "specrunner-test-case-gen",
  role: STEP_NAMES.TEST_CASE_GEN,
  model: TEST_CASE_GEN_AGENT_MODEL,
  system: TEST_CASE_GEN_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * TestCaseGenStep: generates test-cases.md from design.md and tasks.md.
 *
 * Position in pipeline: spec-review:approved → test-case-gen → implementer
 *
 * Has its own dedicated AgentDefinition (role: "test-case-gen").
 * No custom tool handlers — uses the standard agent toolset.
 * No result file parsed — completion detected via session idle (completionVerdict).
 * completionVerdict: "success" — session completion maps to "success" for transitions.
 *
 * Output guarantee: writes() declares test-cases.md with verify enabled (verify !== false).
 * The generic output gate (producedContractsFromWrites → validateStepOutputs, policy "halt")
 * will emit STEP_OUTPUT_MISSING if the agent completes without producing test-cases.md.
 * This is the producer's own safety net — code-review no longer carries this responsibility.
 *
 * Design D1 (add-test-case-generation-step): same pattern as implementer.
 * Design D6: maxTurns = 15 (design-reading only; matches spec-review).
 */
export const TestCaseGenStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.TEST_CASE_GEN,

  agent: testCaseGenAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  reportTool: PRODUCER_REPORT_TOOL,

  maxTurns: 15,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/design.md` },
      { path: `${folder}/tasks.md` },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: `${changeFolderPath(deps.slug)}/test-cases.md` },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.TEST_CASE_GEN);
    return buildTestCaseGenInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      requestContent: deps.request.content,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // test-case-gen does not produce a pipeline-parsed verdict file.
    // The agent commits test-cases.md directly; completionVerdict: "success" marks the step done.
    // Output-gate verification (writes() → producedContractsFromWrites → validateStepOutputs)
    // ensures test-cases.md was actually written.
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
