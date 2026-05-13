import type { AgentStep } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../prompts/code-fixer-system.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { SpecRunnerError, branchNotSetError } from "../../errors.js";
import { changeFolderPath } from "../../util/paths.js";

const CODE_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/** Error code when no code-review result is available for code-fixer to reference. */
export const CODE_FIXER_NO_REVIEW_RESULT = "CODE_FIXER_NO_REVIEW_RESULT";

/**
 * Full AgentDefinition owned by CodeFixerStep.
 * tools = [agent_toolset_20260401] — code-fixer reads review feedback and fixes code.
 * capabilities.gitWrite = true — code-fixer commits and pushes fixes.
 */
const codeFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-code-fixer",
  role: "code-fixer",
  model: CODE_FIXER_AGENT_MODEL,
  system: CODE_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
  capabilities: {
    gitWrite: true,
  },
};

/**
 * CodeFixerStep: implements the code-fixer pipeline step.
 *
 * Has its own dedicated AgentDefinition (role: "code-fixer").
 * No custom tool handlers — code-fixer uses the standard agent toolset.
 * No result file — completion detected via polling (session idle).
 * completionVerdict: "approved" — session completion maps to "approved" for transitions
 * (enabling code-fixer --approved→ code-review loop).
 *
 * Reads the latest code-review result to provide context to the agent.
 * If no code-review result is found, throws SpecRunnerError with CODE_FIXER_NO_REVIEW_RESULT.
 * The caller (runPollingStyleStep) catches this and halts the pipeline before creating a session.
 *
 * Design D7: resultFilePath = null, parseResult = NULL_PARSE_RESULT, completionVerdict = "approved".
 * Design D6: separate Agent with dedicated system prompt (gitWrite: true).
 */
export const CodeFixerStep: AgentStep = {
  kind: "agent",
  name: "code-fixer",

  agent: codeFixerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "approved",

  requiresCommit: true,

  // maxTurns: code-fixer applies review findings; 30 covers multi-finding fixes.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 30,

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError("code-fixer");
    const branch = state.branch;
    const codeReviewResult = getLatestStepResult(state, "code-review");

    // Pure function — must not mutate state.
    // Throw if code-review result is absent so the caller can halt before creating a session.
    if (!codeReviewResult || !codeReviewResult.findingsPath) {
      throw new SpecRunnerError(
        CODE_FIXER_NO_REVIEW_RESULT,
        `Ensure code-review step produced ${changeFolderPath(deps.slug)}/review-feedback-NNN.md before invoking code-fixer.`,
        "code-fixer requires code-review result but none found",
      );
    }

    const findingsPath = codeReviewResult.findingsPath;

    return `<user-request>
You are the code-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${branch}
Review feedback: ${findingsPath}

Please:
1. Read the review feedback at ${findingsPath}
2. Fix all HIGH severity findings (mandatory)
3. Fix MEDIUM severity findings only if they do not require design changes
4. Ignore LOW severity findings
5. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
6. Do NOT modify the review-feedback file itself
7. Do NOT add new features or make specification changes

Original request:
${deps.request.content}
</user-request>`;
  },

  resultFilePath(_state: JobState, _deps: StepDeps): null {
    // code-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
