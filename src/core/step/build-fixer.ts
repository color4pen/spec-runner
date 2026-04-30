import type { AgentStep } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../prompts/build-fixer-system.js";
import { buildGitPushInstruction } from "../../prompts/git-push-instruction.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { SpecRunnerError } from "../../errors.js";

const BUILD_FIXER_AGENT_MODEL = "claude-sonnet-4-5";

/** Error code when no verification result is available for build-fixer to reference. */
export const BUILD_FIXER_NO_VERIFICATION_RESULT = "BUILD_FIXER_NO_VERIFICATION_RESULT";

/**
 * Full AgentDefinition owned by BuildFixerStep.
 * tools = [agent_toolset_20260401] — build-fixer reads error logs and fixes code.
 * capabilities.gitWrite = true — build-fixer commits and pushes fixes.
 */
const buildFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-build-fixer",
  role: "build-fixer",
  model: BUILD_FIXER_AGENT_MODEL,
  system: BUILD_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
  capabilities: {
    gitWrite: true,
  },
};

/**
 * BuildFixerStep: implements the build-fixer pipeline step.
 *
 * Has its own dedicated AgentDefinition (role: "build-fixer").
 * No custom tool handlers — build-fixer uses the standard agent toolset.
 * No result file — completion detected via polling (session idle).
 * completionVerdict: "success" — session completion maps to "success" for transitions.
 *
 * Reads the latest verification result to provide context to the agent.
 * If no verification result is found, throws SpecRunnerError with BUILD_FIXER_NO_VERIFICATION_RESULT.
 * The caller (runPollingStyleStep) catches this and halts the pipeline before creating a session.
 */
export const BuildFixerStep: AgentStep = {
  kind: "agent",
  name: "build-fixer",

  agent: buildFixerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",

  buildMessage(state: JobState, deps: StepDeps): string {
    const branch = state.branch ?? "main";
    const verificationResult = getLatestStepResult(state, "verification");

    // Pure function — must not mutate state.
    // Throw if verification result is absent so the caller can halt before creating a session.
    if (!verificationResult || !verificationResult.findingsPath) {
      throw new SpecRunnerError(
        BUILD_FIXER_NO_VERIFICATION_RESULT,
        `Ensure verification step produced openspec/changes/${deps.slug}/verification-result.md before invoking build-fixer.`,
        "build-fixer requires verification result but none found",
      );
    }

    const findingsPath = verificationResult.findingsPath;

    return `<user-request>
You are the build-fixer for the following change:

Change folder: openspec/changes/${deps.slug}
Branch: ${branch}
Verification result: ${findingsPath}

Please:
1. Read the verification result at ${findingsPath}
2. Identify all failed phases and their error logs
3. Fix the errors mechanically (NO specification changes, NO design decisions)
4. ${buildGitPushInstruction(branch)}
5. Do NOT modify verification-result.md itself

Original request:
${deps.request.content}
</user-request>`;
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // build-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
