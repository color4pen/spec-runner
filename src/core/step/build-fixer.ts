import type { AgentStep, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../prompts/build-fixer-system.js";
import { branchNotSetError } from "../../errors.js";
import { extractVerificationFailures } from "../verification/parse-result.js";
import { changeFolderPath, verificationResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { isFixerContinuation, buildContinuationMessage } from "./fixer-helpers.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const BUILD_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by BuildFixerStep.
 * tools = [agent_toolset_20260401] — build-fixer reads error logs and fixes code.
 * capabilities.gitWrite = true — build-fixer commits and pushes fixes.
 */
const buildFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-build-fixer",
  role: STEP_NAMES.BUILD_FIXER,
  model: BUILD_FIXER_AGENT_MODEL,
  system: BUILD_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
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
 * Required input existence is validated by StepExecutor before runner.run() is called
 * (STEP_INPUT_MISSING). The step itself does not perform state-lookup halts.
 */
export const BuildFixerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.BUILD_FIXER,

  agent: buildFixerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: build-fixer iterates on compile/test errors; 35 covers complex fixes.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 35,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: verificationResultPath(deps.slug) },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: changeFolderPath(deps.slug), artifact: "gitState" },
    ];
  },

  async enrichContext(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext> {
    const findingsPath = verificationResultPath(slug);
    try {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const content = await readFile(resolve(cwd, findingsPath), "utf-8");
      return { ...dynamicContext, verificationContent: content };
    } catch {
      return dynamicContext;
    }
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.BUILD_FIXER);
    const branch = state.branch;

    // Derive findingsPath from reads declaration (D4: replace state-lookup halt).
    // Existence is guaranteed by pre-execution validation (STEP_INPUT_MISSING).
    const findingsPath = verificationResultPath(deps.slug);

    // Session 継続の場合は短縮 prompt（前回コンテキストが session に残っているため）
    if (isFixerContinuation(state, STEP_NAMES.BUILD_FIXER)) {
      return buildContinuationMessage({
        stepName: STEP_NAMES.BUILD_FIXER,
        findingsPath,
        slug: deps.slug,
      });
    }

    // 初回は現行の full prompt（インライン failure context を含む）
    // verificationContent is pre-read by enrichContext from the actual result file.
    const failureSection = buildFailureSection(deps.dynamicContext?.verificationContent);

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
