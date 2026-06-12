import type { AgentStep, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../prompts/code-fixer-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath, resolveReviewerResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { latestIteration } from "./io-iteration.js";
import { isFixerContinuation, buildContinuationMessage, getLatestJudgeFindings, buildFindingsBlock, getConformanceFixContext } from "./fixer-helpers.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";
import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";
import { conformanceResultPath } from "../../util/paths.js";

const CODE_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by CodeFixerStep.
 * tools = [agent_toolset_20260401] — code-fixer reads review feedback and fixes code.
 * capabilities.gitWrite = true — code-fixer commits and pushes fixes.
 */
const codeFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-code-fixer",
  role: STEP_NAMES.CODE_FIXER,
  model: CODE_FIXER_AGENT_MODEL,
  system: CODE_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
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
 * Required input existence is validated by StepExecutor before runner.run() is called
 * (STEP_INPUT_MISSING). The step itself does not perform state-lookup halts.
 *
 * Design D7: resultFilePath = null, parseResult = NULL_PARSE_RESULT, completionVerdict = "approved".
 * Design D6: separate Agent with dedicated system prompt (gitWrite: true).
 */
export const CodeFixerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.CODE_FIXER,

  agent: codeFixerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "approved",
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: code-fixer applies review findings; 30 covers multi-finding fixes.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 30,

  reads(state: JobState, deps: StepDeps): IoRef[] {
    // Conformance-triggered entry: read conformance result file
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.CODE_FIXER);
    if (conformanceFindings !== null) {
      return [
        { path: conformanceResultPath(deps.slug, latestIteration(state, STEP_NAMES.CONFORMANCE)) },
      ];
    }
    // Normal entry: read active reviewer result
    const chain = deriveImplFixerChain(state);
    const activeReviewer = resolveActiveReviewer(state, chain);
    return [
      { path: resolveReviewerResultPath(deps.slug, activeReviewer, latestIteration(state, activeReviewer)) },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: changeFolderPath(deps.slug), artifact: "gitState" },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.CODE_FIXER);
    const branch = state.branch;

    // Conformance-triggered entry: use conformance findings
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.CODE_FIXER);
    if (conformanceFindings !== null) {
      const findingsPath = conformanceResultPath(deps.slug, latestIteration(state, STEP_NAMES.CONFORMANCE));
      if (isFixerContinuation(state, STEP_NAMES.CODE_FIXER)) {
        return buildContinuationMessage({
          stepName: STEP_NAMES.CODE_FIXER,
          findingsPath,
          slug: deps.slug,
          findings: conformanceFindings,
          reviewerName: "conformance",
        });
      }
      const findingsBlock = buildFindingsBlock(conformanceFindings, "conformance");
      return `<user-request>
You are the code-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${branch}

## Conformance non-conformities (must resolve)

${findingsBlock}

Please:
1. Fix all HIGH and CRITICAL severity findings from the conformance review (mandatory)
2. Fix MEDIUM severity findings only if they do not require design changes
3. Ignore LOW severity findings
4. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
5. Do NOT add new features or make specification changes

Original request:
${deps.request.content}
</user-request>`;
    }

    // Normal entry: resolve the active reviewer
    const chain = deriveImplFixerChain(state);
    const activeReviewer = resolveActiveReviewer(state, chain);

    // Derive findingsPath from reads declaration (D4: replace state-lookup halt).
    // Existence is guaranteed by pre-execution validation (STEP_INPUT_MISSING).
    const findingsPath = resolveReviewerResultPath(deps.slug, activeReviewer, latestIteration(state, activeReviewer));

    // Get structured findings from the latest active reviewer run (if available)
    const findings = getLatestJudgeFindings(state, activeReviewer);

    // For custom reviewers, include name in findings source identification.
    // Standard code-review uses no prefix (backward compat).
    const reviewerNameForMessage = activeReviewer !== STEP_NAMES.CODE_REVIEW ? activeReviewer : undefined;

    // Session 継続の場合は短縮 prompt（前回コンテキストが session に残っているため）
    if (isFixerContinuation(state, STEP_NAMES.CODE_FIXER)) {
      return buildContinuationMessage({
        stepName: STEP_NAMES.CODE_FIXER,
        findingsPath,
        slug: deps.slug,
        findings,
        reviewerName: reviewerNameForMessage,
      });
    }

    // 初回: findings がある場合は埋め込む、ない場合は findingsPath 方式にフォールバック
    if (findings && findings.length > 0) {
      const findingsBlock = buildFindingsBlock(findings, reviewerNameForMessage);
      return `<user-request>
You are the code-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${branch}

${findingsBlock}

Please:
1. Fix all HIGH and CRITICAL severity findings (mandatory)
2. Fix MEDIUM severity findings only if they do not require design changes
3. Ignore LOW severity findings
4. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
5. Do NOT add new features or make specification changes

Original request:
${deps.request.content}
</user-request>`;
    }

    // フォールバック: 旧 toolResult を持つ job の resume → findingsPath 方式
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
