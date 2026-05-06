import type { AgentStep, StepDeps, ParsedStepResult } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../prompts/code-review-system.js";
import { buildGitPushInstruction } from "../../prompts/git-push-instruction.js";
import { parseReviewVerdict } from "../parser/review-verdict.js";

const CODE_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Build the review-feedback file path for a given iteration.
 * Format: openspec/changes/<slug>/review-feedback-NNN.md (3-digit zero-padded)
 */
export function buildReviewFeedbackPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `openspec/changes/${slug}/review-feedback-${nnn}.md`;
}

/**
 * Compute the iteration number for the next code-review push.
 */
function computeCodeReviewIteration(state: JobState): number {
  return (state.steps?.["code-review"]?.length ?? 0) + 1;
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
  role: "code-review",
  model: CODE_REVIEW_AGENT_MODEL,
  system: CODE_REVIEW_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
  capabilities: { gitWrite: true },
};

/**
 * Build the initial user message for the code-review session.
 */
function buildCodeReviewInitialMessage(opts: {
  slug: string;
  branch: string | undefined;
  iteration: number;
  findingsPath: string;
  requestContent: string;
}): string {
  const gitInstruction = opts.branch
    ? buildGitPushInstruction(opts.branch)
    : "After writing the result file, commit and push to the branch before ending your session.";

  return `<user-request>
Please perform a code review for the following change:

Change folder: openspec/changes/${opts.slug}
Iteration: ${opts.iteration}

Steps:
1. Run \`git diff main...HEAD --stat\` to understand the scope of changes
2. Review the implementation files changed in this branch
3. Read the spec in openspec/changes/${opts.slug}/ (design.md, tasks.md)
4. Read .claude/rules/review-standards.md for the findings format and severity definitions
5. Check test coverage against openspec/changes/${opts.slug}/test-cases.md (must scenarios)
6. Write your findings and verdict to: ${opts.findingsPath}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

Original request:
${opts.requestContent}
</user-request>

${gitInstruction}`;
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
  name: "code-review",

  agent: codeReviewAgentDefinition,

  toolHandlers: undefined,

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
    });
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeCodeReviewIteration(state);
    return buildReviewFeedbackPath(deps.slug, iteration);
  },

  parseResult(content: string, _deps: StepDeps): ParsedStepResult {
    const verdict = parseReviewVerdict(content);
    return {
      verdict: verdict ?? "escalation",
      findingsPath: null, // filled in by StepExecutor after fetch
      fileContent: content,
    };
  },
};
