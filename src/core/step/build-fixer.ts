import type { AgentStep } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../prompts/build-fixer-system.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { SpecRunnerError, branchNotSetError } from "../../errors.js";
import { extractVerificationFailures } from "../verification/parse-result.js";
import { changeFolderPath } from "../../util/paths.js";

const BUILD_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

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

  requiresCommit: true,

  // maxTurns: build-fixer iterates on compile/test errors; 35 covers complex fixes.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 35,

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError("build-fixer");
    const branch = state.branch;
    const verificationResult = getLatestStepResult(state, "verification");

    // Pure function — must not mutate state.
    // Throw if verification result is absent so the caller can halt before creating a session.
    if (!verificationResult || !verificationResult.findingsPath) {
      throw new SpecRunnerError(
        BUILD_FIXER_NO_VERIFICATION_RESULT,
        `Ensure verification step produced ${changeFolderPath(deps.slug)}/verification-result.md before invoking build-fixer.`,
        "build-fixer requires verification result but none found",
      );
    }

    const findingsPath = verificationResult.findingsPath;

    // Build the inline failure context from fileContent when available.
    const failureSection = buildFailureSection(verificationResult.fileContent);

    return `<user-request>
You are the build-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${branch}
Verification result: ${findingsPath}
${failureSection}
Please:
1. Read the verification result at ${findingsPath}
2. Identify all failed phases and their error logs
3. Fix the errors mechanically (NO specification changes, NO design decisions)
4. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
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

/**
 * Build the "## Verification Failures" section for the build-fixer initial message.
 *
 * When fileContent is available, extracts failed phases and their error output inline
 * so the agent can start fixing immediately without an extra file read turn.
 *
 * Returns an empty string when fileContent is null/undefined (fallback to findingsPath only).
 * Returns an empty string when no failures are found in fileContent.
 */
function buildFailureSection(fileContent: string | null | undefined): string {
  if (!fileContent) {
    return "";
  }

  const failures = extractVerificationFailures(fileContent);
  if (failures.length === 0) {
    return "";
  }

  const lines: string[] = ["", "## Verification Failures", ""];

  for (const failure of failures) {
    lines.push(`- **Failed phase**: ${failure.phase}`);
    lines.push(`- **Exit code**: ${failure.exitCode}`);
    lines.push("");
    lines.push("### Error output");
    lines.push("```");
    lines.push(failure.output);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
