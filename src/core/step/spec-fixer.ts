import type { AgentStep, StepDeps, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../prompts/spec-fixer-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath, specReviewResultPath, conformanceResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { latestIteration } from "./io-iteration.js";
import { isFixerContinuation, buildContinuationMessage, getLatestJudgeFindings, buildFindingsBlock, getConformanceFixContext } from "./fixer-helpers.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const SPEC_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by SpecFixerStep.
 * tools = [] — spec-fixer has no Custom Tools.
 * Design D8: Tool spec ownership is co-located with the Step.
 */
const specFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-spec-fixer",
  role: STEP_NAMES.SPEC_FIXER,
  model: SPEC_FIXER_AGENT_MODEL,
  system: SPEC_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
};

/**
 * Build the initial user message for the spec-fixer session.
 * Wraps user-controlled content in XML delimiters for prompt injection protection.
 */
function buildSpecFixerInitialMessage(opts: {
  slug: string;
  branch: string;
  findingsPath: string;
}): string {
  const { slug, branch, findingsPath } = opts;
  return `<user-request>
You are the spec-fixer for the following change:

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}
Findings file: ${findingsPath}

Please:
1. Read the findings file at ${findingsPath}
2. For each finding, implement the fix described in the "How to Fix" column
3. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
4. Do NOT modify the spec-review-result.md file itself

If any finding cannot be fixed, add a comment at the end of design.md:
<!-- spec-fixer-deferred: [finding number] [reason] -->
</user-request>`;
}

/**
 * SpecFixerStep: implements the spec-fixer pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "spec-fixer").
 * No custom tool handlers — spec-fixer has no Custom Tools.
 * No result file — spec-fixer completion is determined by polling.
 */
export const SpecFixerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.SPEC_FIXER,

  agent: specFixerAgentDefinition,

  // No custom tool handlers for spec-fixer
  toolHandlers: undefined,

  // completionVerdict: "approved" — spec-fixer has no result file; polling completion
  // maps to "approved" (enabling spec-fixer → spec-review loop via transition table).
  completionVerdict: "approved",
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: spec-fixer applies findings mechanically; 25 covers multi-finding fix cycles.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 25,

  reads(state: JobState, deps: StepDeps): IoRef[] {
    // Conformance-triggered entry: read conformance result file
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER);
    if (conformanceFindings !== null) {
      return [
        { path: conformanceResultPath(deps.slug, latestIteration(state, STEP_NAMES.CONFORMANCE)) },
      ];
    }
    // Normal entry: read most recent spec-review result (required — executor validates before running)
    return [
      { path: specReviewResultPath(deps.slug, latestIteration(state, STEP_NAMES.SPEC_REVIEW)) },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/design.md` },
      { path: `${folder}/spec.md` },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.SPEC_FIXER);

    // Conformance-triggered entry: use conformance findings
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER);
    if (conformanceFindings !== null) {
      const findingsPath = conformanceResultPath(deps.slug, latestIteration(state, STEP_NAMES.CONFORMANCE));
      if (isFixerContinuation(state, STEP_NAMES.SPEC_FIXER)) {
        return buildContinuationMessage({
          stepName: STEP_NAMES.SPEC_FIXER,
          findingsPath,
          slug: deps.slug,
          findings: conformanceFindings,
          reviewerName: "conformance",
        });
      }
      const findingsBlock = buildFindingsBlock(conformanceFindings, "conformance");
      return `<user-request>
You are the spec-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${state.branch}

## Conformance non-conformities (must resolve)

${findingsBlock}

Please:
1. For each finding above, fix the spec.md or design.md artifact as indicated by the rationale
2. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
3. Do NOT modify the conformance result file itself

If any finding cannot be fixed, add a comment at the end of design.md:
<!-- spec-fixer-deferred: [finding title] [reason] -->
</user-request>`;
    }

    // Normal entry: derive findingsPath from reads declaration (D4: replace state-lookup halt).
    // Existence is guaranteed by pre-execution validation (STEP_INPUT_MISSING).
    const findingsPath = specReviewResultPath(deps.slug, latestIteration(state, STEP_NAMES.SPEC_REVIEW));

    // Get structured findings from the latest spec-review run (if available)
    const findings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW);

    // Session 継続の場合は短縮 prompt（前回コンテキストが session に残っているため）
    if (isFixerContinuation(state, STEP_NAMES.SPEC_FIXER)) {
      return buildContinuationMessage({
        stepName: STEP_NAMES.SPEC_FIXER,
        findingsPath,
        slug: deps.slug,
        findings,
      });
    }

    // 初回: findings がある場合は埋め込む、ない場合は findingsPath 方式にフォールバック
    if (findings && findings.length > 0) {
      const findingsBlock = buildFindingsBlock(findings);
      return `<user-request>
You are the spec-fixer for the following change:

Change folder: ${changeFolderPath(deps.slug)}
Branch: ${state.branch}

${findingsBlock}

Please:
1. For each finding above, implement the fix described in the rationale
2. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
3. Do NOT modify the spec-review-result.md file itself

If any finding cannot be fixed, add a comment at the end of design.md:
<!-- spec-fixer-deferred: [finding title] [reason] -->
</user-request>`;
    }

    // フォールバック: 旧 toolResult を持つ job の resume → findingsPath 方式
    return buildSpecFixerInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      findingsPath,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // spec-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // spec-fixer has no file-based verdict
    return NULL_PARSE_RESULT;
  },
};
