/**
 * System prompt for the spec-review step.
 * The agent acts as both architect and spec-reviewer in a single session.
 * No custom tools — verdict is written to a file in the change folder.
 */
export const SPEC_REVIEW_SYSTEM_PROMPT = `You are a SpecRunner spec-reviewer agent. You play two roles simultaneously:
1. **architect** — evaluate whether the proposed design is sound, feasible, and aligned with existing architecture
2. **spec-reviewer** — verify that the specification is complete, consistent, and reviewable

Your task is to review the change folder and produce a verdict on the specification quality.

## Your Output

Write your findings to: openspec/changes/<slug>/spec-review-result.md

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
| 1 | HIGH | completeness | openspec/changes/<slug>/tasks.md:10 | Missing error handling spec | Add error codes for each failure mode |

Severity levels: CRITICAL, HIGH, MEDIUM, LOW

## Important Constraints

- Do NOT propose fixes or rewrite spec sections. Your role is evaluation only.
- Write the verdict line BEFORE the findings table.
- Use exactly the format shown above — the verdict line must start with \`- **verdict**:\` at the beginning of a line.
- Findings must follow review-standards.md severity definitions.
- Do not modify any source code or spec files other than writing spec-review-result.md.`;

/**
 * Template for the initial user message sent to the spec-review session.
 */
export const SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE = `Please review the following change folder specification and produce a verdict.

Change folder: openspec/changes/{{SLUG}}
Repository: {{REPOSITORY}}
Request type: {{REQUEST_TYPE}}
Enabled options: {{ENABLED}}

<user-request>
{{REQUEST_CONTENT}}
</user-request>

Review all spec files in the change folder (proposal.md, design.md, tasks.md, specs/). Write your verdict and findings to:
openspec/changes/{{SLUG}}/spec-review-result.md

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\``;

export interface SpecReviewPromptInput {
  slug: string;
  repository: string;
  requestType: string;
  enabled?: string[];
  requestContent?: string;
}

/**
 * Build the spec-review system prompt (static, no per-request injection needed).
 */
export function buildSpecReviewSystemPrompt(_input: SpecReviewPromptInput): string {
  return SPEC_REVIEW_SYSTEM_PROMPT;
}

/**
 * Build the initial message for the spec-review session.
 */
export function buildSpecReviewInitialMessage(input: SpecReviewPromptInput): string {
  const enabledStr = input.enabled && input.enabled.length > 0
    ? input.enabled.join(", ")
    : "none";
  const requestContent = input.requestContent ?? "(see change folder)";

  return SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE
    .replace(/{{SLUG}}/g, input.slug)
    .replace(/{{REPOSITORY}}/g, input.repository)
    .replace(/{{REQUEST_TYPE}}/g, input.requestType)
    .replace(/{{ENABLED}}/g, enabledStr)
    .replace(/{{REQUEST_CONTENT}}/g, requestContent);
}
