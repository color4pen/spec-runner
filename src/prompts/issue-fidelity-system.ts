/**
 * System prompt and user message builder for the issue-fidelity comparator.
 *
 * Purpose: compare a GitHub issue body with a request.md to identify requirements
 * mentioned in the issue but absent from both the request's requirements section
 * and its scope-out declarations (undeclared drops).
 *
 * Non-propagation: this module is used only by the entrance fidelity gate adapter.
 * The issue body is never stored in job state or injected into pipeline step prompts.
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * System prompt for the issue-fidelity comparator LLM call.
 *
 * Contract:
 * 1. Enumerate requirements from the issue body.
 * 2. Respect scope-out (スコープ外) declarations in the request — do NOT treat them as drops.
 * 3. Do NOT require exact match or zero diff — semantic sufficiency is enough.
 * 4. Output must include `undeclaredDrops` key in structured JSON.
 * 5. Do NOT copy the issue body verbatim into output (non-propagation).
 */
export const ISSUE_FIDELITY_SYSTEM_PROMPT = `You are an expert requirements analyst. Your task is to compare a GitHub issue with a request.md file to identify requirements that may have been silently dropped.

## Instructions

1. **enumerate and analyze** the requirements stated in the issue (title + body). For each requirement, determine whether it is:
   - **Present**: explicitly or semantically covered in the request's requirements section.
   - **Scoped out**: declared as out-of-scope (スコープ外 / scope-out) in the request — these are NOT drops.
   - **Undeclared drop**: mentioned in the issue but absent from both the requirements section AND any scope-out declaration.

2. **Scope-out declarations are respected**: if the request declares a requirement as out of scope, do NOT include it as an undeclared drop. Explicit scope-out declarations show the omission was intentional.

3. **Exact match / verbatim copy is NOT required**: semantic equivalence is sufficient. If the request covers the intent of an issue requirement, even with different wording, it is NOT a drop.

4. **Fail-closed when uncertain**: if you are unsure whether a requirement is satisfied, treat it as an undeclared drop.

5. **Do NOT copy issue body text verbatim** in your output. Summarize dropped requirements concisely.

## Output format

Respond with a JSON object containing exactly one key: \`undeclaredDrops\`. Each element is a concise description of a dropped requirement.

Example (drops found):
\`\`\`json
{"undeclaredDrops":["install into fixture project","run from subdirectory"]}
\`\`\`

Example (no drops):
\`\`\`json
{"undeclaredDrops":[]}
\`\`\`

Do not include explanations outside the JSON block.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Build the user message for the issue-fidelity comparator LLM call.
 *
 * Uses explicit boundary tags to prevent prompt injection from issue/request content.
 *
 * @param input.issueTitle  GitHub issue title.
 * @param input.issueBody   GitHub issue body (markdown).
 * @param input.requestMd   Full content of the request.md file.
 */
export function buildIssueFidelityUserMessage(input: {
  issueTitle: string;
  issueBody: string;
  requestMd: string;
}): string {
  return `Compare the following GitHub issue with the request.md file and identify any undeclared drops.

<issue>
## Title
${input.issueTitle}

## Body
${input.issueBody}
</issue>

<request>
${input.requestMd}
</request>

Identify requirements from the issue that are absent from both the request requirements section and the scope-out declarations. Output a JSON object with the \`undeclaredDrops\` key.`;
}
