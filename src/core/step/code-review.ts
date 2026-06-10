import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../prompts/code-review-system.js";
import { reviewFeedbackPath, changeFolderPath } from "../../util/paths.js";
import { nextIteration } from "./io-iteration.js";
import { STEP_NAMES } from "./step-names.js";
import { buildRequestConstraintsBlock } from "../../parser/extract-section.js";
import { CODE_REVIEW_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const CODE_REVIEW_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Build the review-feedback file path for a given iteration.
 * Delegates to reviewFeedbackPath from util/paths.ts.
 * Re-exported here for backward compatibility with callers that import from this module.
 */
export function buildReviewFeedbackPath(slug: string, iteration: number): string {
  return reviewFeedbackPath(slug, iteration);
}

/**
 * Compute the iteration number for the next code-review push.
 */
function computeCodeReviewIteration(state: JobState): number {
  return (state.steps?.[STEP_NAMES.CODE_REVIEW]?.length ?? 0) + 1;
}

/**
 * Full AgentDefinition owned by CodeReviewStep.
 * gitWrite: true — review-feedback file is committed and pushed by the agent.
 * Source code remains read-only (enforced by prompt: "Do NOT modify any source files").
 * Note: openspec-workflow's reference implementation uses orchestrator commit (claude-code local),
 * but Anthropic Managed Agents require agent-driven push. See ADR-20260430-review-exit-contract.
 */
const codeReviewAgentDefinition: AgentDefinition = {
  name: "specrunner-code-review",
  role: STEP_NAMES.CODE_REVIEW,
  model: CODE_REVIEW_AGENT_MODEL,
  system: CODE_REVIEW_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(CODE_REVIEW_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * Build the initial user message for the code-review session.
 *
 * When dynamicContext is provided and has diffStat, it is included as a
 * pre-computed context section so the agent doesn't need to run git commands
 * to understand the overall change scope.
 */
export function buildCodeReviewInitialMessage(opts: {
  slug: string;
  branch: string | undefined;
  iteration: number;
  findingsPath: string;
  requestContent: string;
  dynamicContext?: DynamicContext;
}): string {
  const contextSection = opts.dynamicContext?.diffStat
    ? `\n\n## Branch Context\n\n### Diff stat (main..HEAD)\n\n\`\`\`\n${opts.dynamicContext.diffStat}\n\`\`\``
    : "";

  // Inject request.md constraint sections after </user-request> tag, before Branch Context.
  // This ensures the reviewer has スコープ外 / 受け入れ基準 / architect 設計判断 in context
  // regardless of whether it reads request.md itself (D1, D2, D3 in design.md).
  const constraintsBlock = buildRequestConstraintsBlock(opts.requestContent);
  const constraintsSection = constraintsBlock ? `\n\n${constraintsBlock}` : "";

  return `<user-request>
Please perform a code review for the following change:

Change folder: ${changeFolderPath(opts.slug)}
Iteration: ${opts.iteration}

Steps:
1. Run \`git diff main...HEAD --stat\` to understand the scope of changes
2. Review the implementation files changed in this branch
3. Read the spec in ${changeFolderPath(opts.slug)}/ (design.md, tasks.md)
4. Refer to the Pipeline Rules in your system prompt for the findings format and severity definitions
5. Check test coverage against ${changeFolderPath(opts.slug)}/test-cases.md (must scenarios)
6. Write your findings and verdict to: ${opts.findingsPath}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

Original request:
${opts.requestContent}
</user-request>${constraintsSection}${contextSection}

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
}

/**
 * CodeReviewStep: implements the code-review pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "code-review").
 * No custom tool handlers — code-review uses the standard agent toolset.
 * Verdict is parsed from a review-feedback-NNN.md file written by the agent.
 * Design D6: separate Agent with dedicated system prompt. Source code read-only; gitWrite for result file delivery.
 * Design D7: resultFilePath returns iteration-based path; parseResult is no-op (R4: verdict from typed toolResult).
 */
export const CodeReviewStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.CODE_REVIEW,

  agent: codeReviewAgentDefinition,

  toolHandlers: undefined,

  needsProjectContext: true,
  reportTool: CODE_REVIEW_REPORT_TOOL,

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/design.md` },
      { path: `${folder}/tasks.md` },
      { path: `${folder}/test-cases.md` },
      { path: ".", artifact: "gitState" },
    ];
  },

  writes(state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: reviewFeedbackPath(deps.slug, nextIteration(state, STEP_NAMES.CODE_REVIEW)) },
    ];
  },

  followUpPrompt: [
    "作業完了後の self-check pass です。",
    "出力した review-feedback ファイルを Read tool で読み、以下を確認してください:",
    "",
    "1. Findings セクションがテーブル形式（`| # | Severity | Category | File | Description | How to Fix | Fix |`）で記述されているか",
    "   - 散文形式やリスト形式は不可。必ず Markdown テーブルであること",
    "2. 必須カラム（#, Severity, Category, File, Description, How to Fix, Fix）が全て存在するか",
    "   - ヘッダー行にこの 7 カラムが揃っていること",
    "3. Fix カラムが全 finding に対して yes / no のいずれかで記入されているか",
    "   - 空欄や他の値は不可",
    "4. report_result の findings 配列が提出されているか",
    "   - 各 finding に severity (critical/high/medium/low), resolution (fixable/decision-needed), file, title, rationale が含まれているか",
    "   - findings が空の場合は [] を渡してあるか",
    "5. 各 finding の severity が Severity 定義と一致しているか",
    "   - critical: 本番障害、データ損失、セキュリティ侵害に直結",
    "   - high: 機能不全、明確なバグ、回避策なし",
    "   - medium: 品質低下、保守性問題、将来のリスク",
    "   - low: 情報提供、スタイル、微小な改善",
    "",
    "違反があれば review-feedback ファイルまたは report_result findings を修正してください。",
    "違反がなければ変更せず end_turn してください。",
  ].join("\n"),

  // maxTurns: code-review reads diff + writes findings; 20 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 20,

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeCodeReviewIteration(state);
    const findingsPath = buildReviewFeedbackPath(deps.slug, iteration);
    return buildCodeReviewInitialMessage({
      slug: deps.slug,
      branch: state.branch ?? undefined,
      iteration,
      findingsPath,
      requestContent: deps.request.content,
      dynamicContext: deps.dynamicContext,
    });
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeCodeReviewIteration(state);
    return buildReviewFeedbackPath(deps.slug, iteration);
  },

  parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
    // R4 (contract lock): prose-verdict parse path is dead (executor uses typed toolResult).
    // parseResult is kept to satisfy the Step interface; verdict: null triggers escalation fallback
    // in the prose path, which is only reached by CLI steps without reportTool.
    return { verdict: null, findingsPath: null };
  },
};
