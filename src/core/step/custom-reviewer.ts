/**
 * Custom reviewer step factory.
 *
 * Creates an AgentStep from a ReviewerSnapshot for use in the composed pipeline.
 * Each custom reviewer is a judge step that shares the code-fixer convergence loop.
 *
 * Design:
 * - reportTool is the shared JUDGE_REPORT_TOOL singleton so executor's isJudgeStep
 *   identity check (=== comparison) works without modification.
 * - Prompt is assembled by buildCustomReviewerSystemPrompt (CLI-owned judge frame).
 * - Result path uses customReviewerResultPath for per-reviewer identification.
 *
 * Managed runtime limitation: role is asserted to AgentStepName for type compat;
 * managed runtime agentId lookup will fail for custom reviewers (T-15 known constraint).
 */
import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { AgentStepName } from "../../state/schema.js";
import type { JobState } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { buildCustomReviewerSystemPrompt } from "../../prompts/custom-reviewer-system.js";
import { customReviewerResultPath, changeFolderPath } from "../../util/paths.js";
import { nextIteration } from "./io-iteration.js";
import { buildRequestConstraintsBlock } from "../../parser/extract-section.js";
import { JUDGE_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";

/** Default model for custom reviewer steps. */
const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6";

/**
 * Build the initial user message for a custom reviewer session.
 */
export function buildCustomReviewerMessage(opts: {
  slug: string;
  reviewerName: string;
  purpose: string;
  iteration: number;
  resultFilePath: string;
  requestContent: string;
  dynamicContext?: DynamicContext;
}): string {
  const contextSection = opts.dynamicContext?.diffStat
    ? `\n\n## Branch Context\n\n### Diff stat (main..HEAD)\n\n\`\`\`\n${opts.dynamicContext.diffStat}\n\`\`\``
    : "";

  const constraintsBlock = buildRequestConstraintsBlock(opts.requestContent);
  const constraintsSection = constraintsBlock ? `\n\n${constraintsBlock}` : "";

  return `<user-request>
Please perform a ${opts.reviewerName} review for the following change:

Change folder: ${changeFolderPath(opts.slug)}
Reviewer: ${opts.reviewerName}
Purpose: ${opts.purpose}
Iteration: ${opts.iteration}

Steps:
1. Run \`git diff main...HEAD --stat\` to understand the scope of changes
2. Review the implementation according to your reviewer definition (観点 / 判定基準)
3. Read the spec in ${changeFolderPath(opts.slug)}/ (design.md, tasks.md)
4. Refer to your system prompt for the findings format and severity definitions
5. Write your findings and verdict to: ${opts.resultFilePath}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

Original request:
${opts.requestContent}
</user-request>${constraintsSection}${contextSection}

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
}

/**
 * Create an AgentStep for a custom reviewer from its snapshot.
 *
 * The returned step:
 * - Uses JUDGE_REPORT_TOOL (singleton identity) so executor's isJudgeStep check fires.
 * - Uses customReviewerResultPath for result file identification.
 * - Has needsProjectContext: true and gitWrite: true like code-review.
 */
export function createCustomReviewerStep(snapshot: ReviewerSnapshot): AgentStep {
  const agentDef: AgentDefinition = {
    name: `specrunner-${snapshot.name}`,
    // Type assertion: managed runtime agentId lookup is a known limitation (T-15).
    role: snapshot.name as AgentStepName,
    model: snapshot.model ?? DEFAULT_REVIEW_MODEL,
    system: buildCustomReviewerSystemPrompt(snapshot),
    tools: [
      { type: AGENT_TOOLSET_TYPE },
      toCustomToolSpec(JUDGE_REPORT_TOOL),
    ],
    capabilities: { gitWrite: true },
  };

  return {
    kind: "agent",
    name: snapshot.name,

    agent: agentDef,

    toolHandlers: undefined,

    needsProjectContext: true,
    // Use JUDGE_REPORT_TOOL singleton — executor isJudgeStep identity check (=== JUDGE_REPORT_TOOL)
    reportTool: JUDGE_REPORT_TOOL,

    maxTurns: 20,

    reads(state: JobState, deps: StepDeps): IoRef[] {
      const folder = changeFolderPath(deps.slug);
      return [
        { path: `${folder}/design.md` },
        { path: `${folder}/tasks.md` },
        { path: `${folder}/test-cases.md` },
        { path: ".", artifact: "gitState" },
      ];
    },

    writes(state: JobState, deps: StepDeps): IoRef[] {
      const iteration = nextIteration(state, snapshot.name);
      return [
        { path: customReviewerResultPath(deps.slug, snapshot.name, iteration) },
      ];
    },

    buildMessage(state: JobState, deps: StepDeps): string {
      const iteration = nextIteration(state, snapshot.name);
      const resultPath = customReviewerResultPath(deps.slug, snapshot.name, iteration);
      return buildCustomReviewerMessage({
        slug: deps.slug,
        reviewerName: snapshot.name,
        purpose: snapshot.purpose,
        iteration,
        resultFilePath: resultPath,
        requestContent: deps.request.content,
        dynamicContext: deps.dynamicContext,
      });
    },

    resultFilePath(state: JobState, deps: StepDeps): string {
      const iteration = nextIteration(state, snapshot.name);
      return customReviewerResultPath(deps.slug, snapshot.name, iteration);
    },

    parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
      // R4 contract: prose-verdict parse path is dead; executor uses typed toolResult.
      return { verdict: null, findingsPath: null };
    },
  };
}
