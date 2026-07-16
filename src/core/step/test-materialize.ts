import type { AgentStep, StepDeps, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { OutputContract } from "../port/output-contract.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { TEST_MATERIALIZE_SYSTEM_PROMPT, buildTestMaterializeInitialMessage } from "../../prompts/test-materialize-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const TEST_MATERIALIZE_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by TestMaterializeStep.
 * test-materialize reads test-cases.md and writes test code (no production code).
 * tools = [agent_toolset_20260401] — needs file read/write and git access.
 * capabilities.gitWrite = true — test files are committed and pushed by the agent.
 *
 * Pipeline position: test-case-gen → test-materialize → implementer
 * Role: gate, phase: impl
 * Commit produced: base OID (tests exist, implementation absent = intentionally red)
 */
const testMaterializeAgentDefinition: AgentDefinition = {
  name: "specrunner-test-materialize",
  role: STEP_NAMES.TEST_MATERIALIZE,
  model: TEST_MATERIALIZE_AGENT_MODEL,
  system: TEST_MATERIALIZE_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * TestMaterializeStep: converts test-cases.md scenarios into test code.
 *
 * Position in pipeline: test-case-gen:success → test-materialize → implementer
 *
 * Has its own dedicated AgentDefinition (role: "test-materialize").
 * No custom tool handlers — uses the standard agent toolset.
 * No result file parsed — completion detected via session idle (completionVerdict).
 * completionVerdict: "success" — session completion maps to "success" for transitions.
 *
 * Output guarantee: writes() declares gitState (test files are dynamically placed).
 * outputContracts() declares a "test-coverage" contract to verify that each must TC
 * has at least one test file entry — test execution is NOT required (red is correct).
 *
 * Design: test-materialize node produces the base OID commit.
 * The base OID contains test files but no implementation code.
 * The subsequent implementer node produces the candidate OID commit.
 */
export const TestMaterializeStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.TEST_MATERIALIZE,

  agent: testMaterializeAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  needsProjectContext: true,
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: test-materialize reads spec and writes tests; 40 is the upper bound.
  maxTurns: 40,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/design.md` },
      { path: `${folder}/tasks.md` },
      { path: `${folder}/test-cases.md` },                  // primary input: required
      { path: `${folder}/spec.md`, required: false },       // optional: Scenario-derived TCs
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      // test files are placed dynamically per project convention; declare as gitState
      { path: changeFolderPath(deps.slug), artifact: "gitState" },
    ];
  },

  outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
    return [
      {
        // Verify: each must TC in test-cases.md has at least one test file entry.
        // Test execution is not required — red tests (no implementation) are correct.
        kind: "test-coverage",
        path: `${changeFolderPath(deps.slug)}/test-cases.md`,
        policy: "halt",
      },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.TEST_MATERIALIZE);
    return buildTestMaterializeInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      requestContent: deps.request.content,
      placement: deps.config.tests?.placement,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // test-materialize does not produce a pipeline-parsed verdict file.
    // Completion detected via session idle (completionVerdict: "success").
    // Output-gate verification (outputContracts → validateStepOutputs)
    // ensures test files with TC IDs were written.
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
