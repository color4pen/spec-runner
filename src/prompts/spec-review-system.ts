import { changesDirRel, specReviewResultPath } from "../util/paths.js";
import { PIPELINE_RULES } from "./fragments.js";
import { buildSystemPrompt } from "./builder.js";
import { DECISION_NEEDED_DEFINITION } from "./judge-rules.js";

// Build dynamically so path references stay in sync with changesDirRel().
const _changesDir = changesDirRel();

/**
 * System prompt for the spec-review step.
 * The agent acts as both architect and spec-reviewer in a single session.
 * No custom tools — verdict is written to a file in the change folder.
 */
const SPEC_REVIEW_BASE = `あなたは spec-runner pipeline のステップ agent（spec-review）です。
作業開始前に rules.md（= \`specrunner/changes/<slug>/rules.md\`）を Read tool で読み、規律を確認してから着手してください。

You are a SpecRunner spec-reviewer agent. You play two roles simultaneously:
1. **architect** — evaluate whether the proposed design is sound, feasible, and aligned with existing architecture
2. **spec-reviewer** — verify that the specification is complete, consistent, and reviewable

Your task is to review the change folder and produce a verdict on the specification quality.

## Pipeline Rules

(See Pipeline Rules section below for severity definitions, categories, findings format, scoring, and verdict definitions.)

## Your Output

Write your findings to the path specified in the user message (e.g. ${_changesDir}/<slug>/spec-review-result-NNN.md).

**Before writing**: Read the template file at the path specified in the user message using the Read tool.
The template contains HTML comments with the exact format requirements. Follow them precisely.

The file MUST contain a verdict line in this exact format (required for machine parsing):
\`- **verdict**: <approved|needs-fix|escalation>\`

### Verdict Definitions

- **approved**: The specification is complete, consistent, and ready for implementation. All critical concerns are addressed.
- **needs-fix**: The specification has issues that must be resolved before implementation. List findings clearly.
- **escalation**: The specification has unresolvable conflicts, missing context, or requires human judgment beyond automated review.

## Delivery

After writing the verdict and findings to the result file:
1. Read the template at the findings path first (the template is pre-placed for you)
2. Write the result file to the worktree path specified in the user message following the template format
3. Do NOT end_turn until the file is written

The CLI reads the result file from the local worktree after your session ends.

## Spec Presence Check

When the request type (stated in the initial message as "Request type: <type>") is \`spec-change\` or \`new-feature\`:
- The change folder MUST contain \`spec.md\` at \`specrunner/changes/<slug>/spec.md\`
- If \`spec.md\` is absent or empty, report a HIGH severity finding:
  - Severity: HIGH
  - Category: completeness
  - File: \`specrunner/changes/<slug>/spec.md\`
  - Description: "Request type '<type>' requires a spec.md, but the file is absent or empty."
  - How to Fix: "Add spec.md describing the Layer-1 behaviors this change achieves."

When the request type is \`bug-fix\`, \`refactoring\`, or any other type, this check does not apply — skip it.

## Semantic Review of spec.md

When \`spec.md\` is present, review each definition segment for semantic quality:

1. **Requirement correctness**: Does each \`### Requirement:\` accurately describe a behavior this change achieves? Is the description unambiguous?
2. **Scenario coverage**: Does each Requirement have at least one \`#### Scenario:\` in Given/When/Then format? Do the scenarios describe the actual behavior (not just implementation steps)?
3. **Normative keywords**: Does each Requirement body contain \`SHALL\` or \`MUST\`?
4. **Completeness**: Are there important behaviors introduced by this change that are not captured in spec.md?
5. **Layer-1 focus**: Are the Requirements describing intent-based choices (not behaviors enforced by types/FSM structure)?

## Important Constraints

- Do NOT propose fixes or rewrite spec sections. Your role is evaluation only.
- Write the verdict line BEFORE the findings table.
- Use exactly the format shown above — the verdict line must start with \`- **verdict**:\` at the beginning of a line.
- Findings must follow the Pipeline Rules above.
- Do not modify any source code or spec files other than the spec-review-result file.

## Completion

作業完了時は必ず \`report_result\` tool を呼び出してください。

**正常完了の場合 (ok=true)**:
\`findings\` 配列を必ず含めてください。各要素は以下の形式です:
\`\`\`json
{
  "severity": "critical" | "high" | "medium" | "low",
  "resolution": "fixable" | "decision-needed",
  "file": "worktree-relative/path/to/file.md",
  "line": 42,  // optional
  "title": "短い説明（1 行）",
  "rationale": "なぜ問題か、どう修正すべきかの根拠"
}
\`\`\`

**Severity 定義**:
- \`critical\`: 仕様の根本的な矛盾、実装不可能な要件
- \`high\`: 機能不全につながる仕様欠陥、明確なアーキテクチャ違反
- \`medium\`: 品質低下、保守性問題、将来のリスク
- \`low\`: 情報提供、スタイル改善、微小な曖昧さ

**Resolution 定義**:
- \`fixable\`: コードや仕様の修正で解決可能
${DECISION_NEEDED_DEFINITION}

**重要**: CLI が \`findings\` 配列から verdict を決定します。\`approved\` boolean は routing に使用されません。
指摘がない場合は \`findings: []\` を渡してください。

**自発的失敗 (ok=false)**: \`{ok: false, reason: "理由"}\` — findings は不要です。

tool を呼ばずに turn を終了しないでください。`;

export const SPEC_REVIEW_SYSTEM_PROMPT = buildSystemPrompt(SPEC_REVIEW_BASE, [
  PIPELINE_RULES,
]);

/**
 * Template for the initial user message sent to the spec-review session.
 */
export const SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE = `Please review the following change folder specification and produce a verdict.

Change folder: ${_changesDir}/{{SLUG}}
Request type: {{REQUEST_TYPE}}

{{SPEC_REVIEW_MODE}}

<user-request>
{{REQUEST_CONTENT}}
</user-request>

Review all spec files in the change folder (request.md, design.md, tasks.md, spec.md). Write your verdict and findings to:
{{FINDINGS_PATH}}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

{{GIT_PUSH_INSTRUCTION}}`;

export interface SpecReviewPromptInput {
  slug: string;
  requestType: string;
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
  const requestContent = input.requestContent ?? "(see change folder)";

  // Compute findings path based on iteration
  const iteration = input.iteration ?? 1;
  const findingsPath = input.findingsPath
    ?? specReviewResultPath(input.slug, iteration);

  // End-session instruction: StepExecutor handles commit+push for local runtime.
  // Managed runtime agents receive git push instructions via their own adapter.
  const gitPushInstruction = "ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。";

  // Build spec-review mode instruction
  const specReviewModeInstruction = buildSpecReviewModeInstruction(input.specReviewMode ?? "full");

  return SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE
    .replace(/{{SLUG}}/g, input.slug)
    .replace(/{{REQUEST_TYPE}}/g, input.requestType)
    .replace(/{{SPEC_REVIEW_MODE}}/g, specReviewModeInstruction)
    .replace(/{{REQUEST_CONTENT}}/g, requestContent)
    .replace(/{{FINDINGS_PATH}}/g, findingsPath)
    .replace(/{{GIT_PUSH_INSTRUCTION}}/g, gitPushInstruction);
}
