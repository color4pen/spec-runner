import { changesDirRel, specReviewResultPath } from "../util/paths.js";
import { PIPELINE_RULES, COMPLETION_REPORT_LINE, COMPLETION_NO_EARLY_STOP_LINE, EVIDENCE_DISCIPLINE, CAUSE_CLASSIFICATION } from "./fragments.js";
import { buildSystemPrompt } from "./builder.js";
import { DECISION_NEEDED_DEFINITION, OBSERVATION_DEFINITION, SEVERITY_DEFINITION } from "./judge-rules.js";
import { SPEC_EXEMPT_MARKER } from "../templates/step-output-templates.js";

// Build dynamically so path references stay in sync with changesDirRel().
const _changesDir = changesDirRel();

/**
 * System prompt for the spec-review step.
 * The agent acts as both architect and spec-reviewer in a single session.
 * No custom tools — verdict is written to a file in the change folder.
 */
const SPEC_REVIEW_BASE = `あなたは spec-runner pipeline のステップ agent（spec-review）です。
作業開始前に rules.md（= \`specrunner/changes/<slug>/rules.md\`）を Read tool で読み、規律を確認してから着手してください。

## Question

成果物一式（design / tasks / spec）は request と矛盾なく、実装可能な仕様になっているか

## Contract

**入力**:
- \`${_changesDir}/<slug>/request.md\` — 正典
- \`${_changesDir}/<slug>/design.md\` / \`tasks.md\` / \`spec.md\` — 上流成果物

**出力**: \`${_changesDir}/<slug>/spec-review-result-NNN.md\` — evidence report

**write-set**: result file のみ（read-only review）
- source code・spec・design・tasks は変更禁止
- add / commit / push の実行は禁止

## Method

1. **Spec Presence Check**: request type が \`spec-change\` または \`new-feature\` の場合、\`spec.md\` の存在を確認する。不在または空の場合は HIGH finding。\`bug-fix\` および \`refactoring\` の場合は spec.md の確認をスキップする。

2. **Spec-Exempt Detection**: \`spec.md\` が \`${SPEC_EXEMPT_MARKER}\` を含む場合、この変更は **spec-exempt** — spec.md を **vacuously satisfied（conforms）** として扱う。Requirement / Scenario の欠如を finding にしない。\`findings: []\` で spec.md 部分を処理し、design.md / tasks.md を通常通りレビューする。

3. **Semantic Review of spec.md**（spec-exempt でない場合）:
   - **Requirement correctness**: 各 \`### Requirement:\` が変更で達成する振る舞いを正確に記述しているか
   - **Scenario coverage**: 各 Requirement に少なくとも 1 つの \`#### Scenario:\` が Given/When/Then 形式で存在するか
   - **Normative keywords**: 各 Requirement 本文に \`SHALL\` または \`MUST\` が含まれるか
   - **Completeness**: この変更で導入される重要な振る舞いが spec に漏れていないか
   - **Layer-1 focus**: Requirement が型/FSM 構造で強制されない意図ベースの選択を記述しているか

4. **design.md / tasks.md Review**: アーキテクチャ整合性・タスク分解の網羅性・実現可能性を評価する。

5. **Output Format**: result file を書き出す前に Read tool でテンプレートを読む。evidence report（\`## 検証した項目\` / \`## 検証できなかった項目\` / \`## Findings 詳細\`）に従う。verdict 行は書かない。result file を書き出したら作業を終えてください。CLI が commit を行います。

## Evidence

${EVIDENCE_DISCIPLINE}

${CAUSE_CLASSIFICATION}

**step 固有の evidence 要求**:
- 読んだ spec ファイル・辿った Scenario・確認した要件を \`## 検証した項目\` に記載する
- 確認できなかった項目（無ければ None）を \`## 検証できなかった項目\` に記載する

## Completion

${COMPLETION_REPORT_LINE}

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

${SEVERITY_DEFINITION}

**Resolution 定義**:
- \`fixable\`: コードや仕様の修正で解決可能
${DECISION_NEEDED_DEFINITION}

${OBSERVATION_DEFINITION}

**重要**: CLI が \`findings\` 配列から verdict を決定します。\`approved\` boolean は routing に使用されません。
指摘がない場合は \`findings: []\` を渡してください。

**自発的失敗 (ok=false)**: \`{ok: false, reason: "理由"}\` — findings は不要です。

${COMPLETION_NO_EARLY_STOP_LINE}`;

export const SPEC_REVIEW_SYSTEM_PROMPT = buildSystemPrompt(SPEC_REVIEW_BASE, [
  PIPELINE_RULES,
]);

/**
 * Template for the initial user message sent to the spec-review session.
 */
export const SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE = `Please review the following change folder specification.

Change folder: ${_changesDir}/{{SLUG}}
Request type: {{REQUEST_TYPE}}

{{SPEC_REVIEW_MODE}}

<user-request>
{{REQUEST_CONTENT}}
</user-request>

Review all spec files in the change folder (request.md, design.md, tasks.md, spec.md). Write your evidence report to:
{{FINDINGS_PATH}}

The evidence report must contain: ## 検証した項目, ## 検証できなかった項目, ## Findings 詳細 sections.
Do NOT write a verdict line — verdict is derived by CLI from typed findings.

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
  const gitPushInstruction = "ファイルを worktree に書き出したら作業を終えてください。CLI が commit + push を行います。";

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
