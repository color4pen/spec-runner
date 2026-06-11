import type { AgentStep, StepDeps, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../../prompts/adr-gen-system.js";
import { changeFolderPath, requestMdPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { latestIteration } from "./io-iteration.js";
import { reviewFeedbackPath } from "../../util/paths.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const ADR_GEN_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * follow-prompt for AdrGenStep.
 * 修正専用 — 判定ステップを含まない（確認バイアス回避）。
 * `adr: true` のパスでのみ発火する（getFollowUpPrompt で gate）。
 */
export const ADR_FOLLOWUP_PROMPT = `作業完了後の self-fix pass です。

あなたが書いた ADR を読み直してください。

1. Alternatives Considered セクションを確認してください:
   - 具体的な代替案名 (### Alternative N: {Name}) が存在するか
   - 各代替案に Pros / Cons / Why not が記述されているか
   - 代替案が placeholder や TODO ではなく、実際に検討された内容であるか

2. 不足があれば、先ほど読んだ change folder artifacts (design.md, request.md, review-feedback) を根拠に追記してください。
   - 代替案は実際に検討されたもののみ記述する（架空の代替案は不要）
   - request.md の「architect 評価済みの設計判断」や「スコープ外」に不採用案の記述がある場合はそれを活用する

3. 既に十分であれば変更せず end_turn してください。`;

/**
 * Full AgentDefinition owned by AdrGenStep.
 * adr-gen reads change folder artifacts and writes the ADR to specrunner/adr/.
 * tools = [agent_toolset_20260401] — needs file read/write and git access.
 * capabilities.gitWrite = true — ADR file is committed and pushed by the agent.
 *
 * Design: 2-stage filter (request.adr flag + agent judge) to prevent ADR overproduction.
 */
const adrGenAgentDefinition: AgentDefinition = {
  name: "specrunner-adr-gen",
  role: STEP_NAMES.ADR_GEN,
  model: ADR_GEN_AGENT_MODEL,
  system: ADR_GEN_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
  capabilities: { gitWrite: true },
};

/**
 * Build the initial user message for the adr-gen session.
 *
 * When request.adr === false, returns a no-op instruction message so the
 * agent terminates immediately without generating any ADR.
 * When request.adr === true, returns a judge+generate instruction with
 * paths to all relevant change folder artifacts.
 */
export function buildAdrGenInitialMessage(opts: {
  slug: string;
  branch: string | undefined;
  baseBranch: string;
  adr: boolean;
  requestContent: string;
}): string {
  const { slug, branch, baseBranch, adr, requestContent } = opts;
  const changeFolder = changeFolderPath(slug);

  if (!adr) {
    return `<user-request>
This request has adr: false — ADR generation is disabled.

No action required. Please end your turn immediately without reading any files or generating any ADR.
</user-request>`;
  }

  const branchInfo = branch ? `Branch: ${branch}` : "";
  return `<user-request>
This request has adr: true — please judge whether this change warrants an ADR and generate one if so.

Change folder: ${changeFolder}
${branchInfo}
Base branch: ${baseBranch}

## Judge materials

Please read the following (if they exist) to make your judgment:

1. request.md: ${changeFolder}/request.md
2. design.md: ${changeFolder}/design.md
3. spec: ${changeFolder}/spec.md
4. review-feedback: ${changeFolder}/review-feedback-*.md (any numbered files)
5. git diff: Run \`git diff ${baseBranch}..HEAD --stat\` to understand the scope of changes

## Instructions

1. Read the materials above
2. Judge: is this change ADR-worthy? Apply the criteria in your system prompt
3. If judge=yes: generate the ADR in specrunner/adr/ following the naming and format rules
4. If judge=no: output the "judge: no / reason: ..." block and end_turn

Original request:
${requestContent}
</user-request>

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
}

/**
 * AdrGenStep: generates an ADR when request.adr === true and the agent judges it worthwhile.
 *
 * Position in pipeline: code-review:approved → adr-gen → pr-create
 *
 * 2-stage filter:
 * - Stage 1 (declarative): request.adr === false → no-op message, agent terminates immediately
 * - Stage 2 (agent judge): agent reads change folder artifacts and decides ADR-worthy or not
 *
 * completionVerdict: "success" — both judge=yes (ADR generated) and judge=no (skip) are success.
 * requiresCommit: undefined (false) — adr-gen may legitimately produce no commit (judge=no case).
 * needsProjectContext: false — no project.md injection needed.
 */
export const AdrGenStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.ADR_GEN,

  agent: adrGenAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  reportTool: PRODUCER_REPORT_TOOL,

  // adr-gen reads design.md / spec.md / review-feedback; 20 turns is sufficient.
  maxTurns: 20,

  needsProjectContext: false,

  reads(state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    const reviewCount = latestIteration(state, STEP_NAMES.CODE_REVIEW);
    const reviewRefs: IoRef[] = reviewCount > 0
      ? [{ path: reviewFeedbackPath(deps.slug, reviewCount), required: false }]
      : [];
    return [
      { path: requestMdPath(deps.slug) },
      { path: `${folder}/design.md` },
      { path: `${folder}/spec.md` },
      ...reviewRefs,
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    // ADR 成果物の path は adr-gen 内の宣言にのみ置く（プロジェクト規律）。
    // Path format: specrunner/adr/{YYYY-MM-DD}-{slug}.md (date is runtime-resolved by agent).
    // Declared as the canonical output directory to document adr-gen's ownership.
    // verify: false — the actual filename includes a runtime-resolved date prefix
    // (specrunner/adr/YYYY-MM-DD-{slug}.md) that differs from the declared path.
    // Existence of the correct filename cannot be verified against this declaration.
    if (!deps.request.adr) return [];
    return [
      { path: `specrunner/adr/${deps.slug}.md`, verify: false },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    return buildAdrGenInitialMessage({
      slug: deps.slug,
      branch: state.branch ?? undefined,
      baseBranch: deps.request.baseBranch,
      adr: deps.request.adr,
      requestContent: deps.request.content,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // adr-gen does not produce a pipeline-parsed verdict file.
    // The agent writes the ADR directly; pipeline detects completion via session idle.
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },

  getFollowUpPrompt(_state: JobState, deps: StepDeps): string | undefined {
    if (!deps.request.adr) return undefined;
    return ADR_FOLLOWUP_PROMPT;
  },
};
