import { buildGitPushInstruction } from "./git-push-instruction.js";
import { changesDirRel, specReviewResultPath } from "../util/paths.js";
import { PIPELINE_RULES } from "./pipeline-rules.js";

// Build dynamically so path references stay in sync with changesDirRel().
const _changesDir = changesDirRel();

/**
 * System prompt for the spec-review step.
 * The agent acts as both architect and spec-reviewer in a single session.
 * No custom tools — verdict is written to a file in the change folder.
 */
export const SPEC_REVIEW_SYSTEM_PROMPT = `You are a SpecRunner spec-reviewer agent. You play two roles simultaneously:
1. **architect** — evaluate whether the proposed design is sound, feasible, and aligned with existing architecture
2. **spec-reviewer** — verify that the specification is complete, consistent, and reviewable

Your task is to review the change folder and produce a verdict on the specification quality.

## Pipeline Rules

${PIPELINE_RULES}

## Your Output

Write your findings to the path specified in the user message (e.g. ${_changesDir}/<slug>/spec-review-result-NNN.md).

The file MUST contain a verdict line in this exact format:
- **verdict**: <value>

Where <value> is exactly one of:
- approved
- needs-fix
- escalation

### Verdict Definitions

- **approved**: The specification is complete, consistent, and ready for implementation. All critical concerns are addressed.
- **needs-fix**: The specification has issues that must be resolved before implementation. List findings clearly.
- **escalation**: The specification has unresolvable conflicts, missing context, or requires human judgment beyond automated review.

## Findings Format

After the verdict line, include a Findings section with a table:

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | ${_changesDir}/<slug>/tasks.md:10 | Missing error handling spec | Add error codes for each failure mode |


## Delivery

After writing the verdict and findings to the result file:
1. Commit the result file to the branch specified in the user message
2. Push to origin
3. Do NOT end_turn until the push is complete

The orchestrator fetches the result file from GitHub — if you do not push, the executor will not find the file.

## Baseline Spec Consistency Check

When baseline specs are provided in the initial message, verify the following:

1. **MODIFIED requirements**: Each Requirement header in the MODIFIED section of the delta spec MUST exist in the corresponding baseline spec. If a MODIFIED requirement references a name that does not exist in the baseline, report as HIGH severity finding (category: consistency).

2. **REMOVED requirements**: Each Requirement header in the REMOVED section MUST exist in the corresponding baseline spec. If a REMOVED requirement references a name that does not exist in the baseline, report as HIGH severity finding (category: consistency).

3. **ADDED requirements**: Each Requirement header in the ADDED section MUST NOT already exist in the corresponding baseline spec. If an ADDED requirement duplicates an existing baseline requirement name, report as HIGH severity finding (category: consistency).

If no baseline specs are provided, skip this check entirely.

## Important Constraints

- Do NOT propose fixes or rewrite spec sections. Your role is evaluation only.
- Write the verdict line BEFORE the findings table.
- Use exactly the format shown above — the verdict line must start with \`- **verdict**:\` at the beginning of a line.
- Findings must follow the Pipeline Rules above.
- Do not modify any source code or spec files other than the spec-review-result file.`;

/**
 * Template for the initial user message sent to the spec-review session.
 */
export const SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE = `Please review the following change folder specification and produce a verdict.

Change folder: ${_changesDir}/{{SLUG}}
Repository: {{REPOSITORY}}
Request type: {{REQUEST_TYPE}}
Enabled options: {{ENABLED}}

{{SPEC_REVIEW_MODE}}

<user-request>
{{REQUEST_CONTENT}}
</user-request>

Review all spec files in the change folder (request.md, design.md, tasks.md, specs/). Write your verdict and findings to:
{{FINDINGS_PATH}}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

{{BASELINE_SPECS}}
{{GIT_PUSH_INSTRUCTION}}`;

export interface SpecReviewPromptInput {
  slug: string;
  repository: string;
  requestType: string;
  enabled?: string[];
  requestContent?: string;
  /** Branch to commit and push result file to. Required for push instruction. */
  branch?: string;
  /** Iteration number (1-origin). Used to compute the findings file name. Default: 1. */
  iteration?: number;
  /** Explicit findings path (overrides iteration-based computation). */
  findingsPath?: string;
  /**
   * Review scope mode for this request type.
   * "full": includes security review (authentication, input validation, OWASP Top 10).
   * "lightweight": architecture and specification review only; security review not required.
   * Defaults to "full" when absent.
   */
  specReviewMode?: "full" | "lightweight";
  /**
   * Baseline spec content keyed by capability name.
   * Injected by SpecReviewStep.enrichContext() when delta specs are present.
   * When absent or empty, the baseline consistency check section is omitted from the message.
   */
  baselineSpecs?: Record<string, string>;
}

/**
 * Build the spec-review system prompt (static, no per-request injection needed).
 */
export function buildSpecReviewSystemPrompt(_input: SpecReviewPromptInput): string {
  return SPEC_REVIEW_SYSTEM_PROMPT;
}

/**
 * Build the spec-review mode instruction line for the initial message.
 */
function buildSpecReviewModeInstruction(mode: "full" | "lightweight"): string {
  if (mode === "lightweight") {
    return `Review scope: Lightweight review — this is a behavior-preserving change.

Verify (review normally):
- architecture: design patterns, responsibility separation, dependency direction
- correctness: logic, boundary conditions, edge cases

Simplify (reduced scope):
- completeness: verify task decomposition coverage only. Requirements coverage is not applicable for behavior-preserving changes.
- consistency: skip cross-referencing with existing specs. No spec changes are expected.

Skip (do not review):
- feasibility: effort estimation is not required for refactoring/chore.
- security: not required for this request type.`;
  }
  return "Review scope: Full review including security considerations (authentication, input validation, OWASP Top 10 where applicable).";
}

/**
 * Build the initial message for the spec-review session.
 */
export function buildSpecReviewInitialMessage(input: SpecReviewPromptInput): string {
  const enabledStr = input.enabled && input.enabled.length > 0
    ? input.enabled.join(", ")
    : "none";
  const requestContent = input.requestContent ?? "(see change folder)";

  // Compute findings path based on iteration
  const iteration = input.iteration ?? 1;
  const findingsPath = input.findingsPath
    ?? specReviewResultPath(input.slug, iteration);

  // Build git push instruction if branch is provided
  const gitPushInstruction = input.branch
    ? buildGitPushInstruction(input.branch)
    : "After writing the result file, commit and push to the branch before ending your session.";

  // Build spec-review mode instruction
  const specReviewModeInstruction = buildSpecReviewModeInstruction(input.specReviewMode ?? "full");

  // Build baseline specs section
  let baselineSpecsSection = "";
  if (input.baselineSpecs && Object.keys(input.baselineSpecs).length > 0) {
    const sections = Object.entries(input.baselineSpecs)
      .map(([cap, content]) => `### Capability: ${cap}\n\n${content}`)
      .join("\n\n---\n\n");
    baselineSpecsSection = `\n<baseline-specs>\n${sections}\n</baseline-specs>\n`;
  }

  return SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE
    .replace(/{{SLUG}}/g, input.slug)
    .replace(/{{REPOSITORY}}/g, input.repository)
    .replace(/{{REQUEST_TYPE}}/g, input.requestType)
    .replace(/{{ENABLED}}/g, enabledStr)
    .replace(/{{SPEC_REVIEW_MODE}}/g, specReviewModeInstruction)
    .replace(/{{REQUEST_CONTENT}}/g, requestContent)
    .replace(/{{FINDINGS_PATH}}/g, findingsPath)
    .replace(/{{BASELINE_SPECS}}/g, baselineSpecsSection)
    .replace(/{{GIT_PUSH_INSTRUCTION}}/g, gitPushInstruction);
}
