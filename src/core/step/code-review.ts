import type { AgentStep, StepDeps, ParsedStepResult } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { Verdict } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../prompts/code-review-system.js";
import { parseReviewVerdict } from "../parser/review-verdict.js";
import { parseReviewScores } from "../parser/review-scores.js";
import type { ReviewScores } from "../parser/review-scores.js";
import { parseFindingSeverityCounts } from "../parser/review-findings.js";
import type { FindingSeverityCounts } from "../parser/review-findings.js";
import { reviewFeedbackPath, changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";

const CODE_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Determine the final verdict using structured scoring when available.
 *
 * Design D3: CLI verdict uses the stricter of CLI and agent verdicts.
 *
 * Rules:
 * 1. agent says escalation → escalation (CLI does not override escalation judgment)
 * 2. no scores → fall back to agent verdict
 * 3. scores available → compute CLI verdict; adopt the stricter of CLI and agent
 *
 * CLI verdict logic:
 *   total >= 7.0 AND critical === 0 AND high === 0 → "approved"
 *   otherwise → "needs-fix"
 *
 * "Stricter wins": needs-fix > approved (if either is needs-fix, result is needs-fix)
 */
function determineVerdict(
  agentVerdict: Verdict | null,
  scores: ReviewScores | null,
  severityCounts: FindingSeverityCounts,
): Verdict {
  // Rule 1: escalation always propagates
  if (agentVerdict === "escalation") {
    return "escalation";
  }

  // Rule 2: no scores — fall back to agent verdict
  if (!scores) {
    return agentVerdict ?? "escalation";
  }

  // Rule 3: compute CLI verdict and adopt the stricter
  const cliVerdict: Verdict =
    scores.total >= 7.0 && severityCounts.critical === 0 && severityCounts.high === 0
      ? "approved"
      : "needs-fix";

  // Stricter wins: needs-fix > approved
  if (agentVerdict === "needs-fix" || cliVerdict === "needs-fix") {
    return "needs-fix";
  }
  return "approved";
}

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
</user-request>${contextSection}

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
}

/**
 * CodeReviewStep: implements the code-review pipeline step as a plain Step object.
 *
 * Has its own dedicated AgentDefinition (role: "code-review").
 * No custom tool handlers — code-review uses the standard agent toolset.
 * Verdict is parsed from a review-feedback-NNN.md file written by the agent.
 * Design D6: separate Agent with dedicated system prompt. Source code read-only; gitWrite for result file delivery.
 * Design D7: resultFilePath returns iteration-based path; parseResult delegates to parseReviewVerdict.
 */
export const CodeReviewStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.CODE_REVIEW,

  agent: codeReviewAgentDefinition,

  toolHandlers: undefined,

  needsProjectContext: true,

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

  parseResult(content: string, _deps: StepDeps): ParsedStepResult {
    const agentVerdict = parseReviewVerdict(content);
    const scores = parseReviewScores(content);
    const severityCounts = parseFindingSeverityCounts(content);

    const verdict = determineVerdict(agentVerdict, scores, severityCounts);

    if (scores) {
      return {
        verdict,
        findingsPath: null, // filled in by StepExecutor after fetch
        fileContent: content,
        scores: {
          ...scores,
          critical: severityCounts.critical,
          high: severityCounts.high,
        },
      };
    }

    return {
      verdict,
      findingsPath: null, // filled in by StepExecutor after fetch
      fileContent: content,
    };
  },
};
