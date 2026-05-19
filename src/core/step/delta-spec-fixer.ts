import type { AgentStep, StepDeps } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import { getLatestStepResult } from "../../state/helpers.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../prompts/spec-fixer-system.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath, deltaSpecValidationResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { isFixerContinuation } from "./fixer-helpers.js";

const DELTA_SPEC_FIXER_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Full AgentDefinition owned by DeltaSpecFixerStep.
 * Reuses SPEC_FIXER_SYSTEM_PROMPT — delta-spec-fixer applies the same spec format
 * rules as spec-fixer; only the input (validation result) differs.
 *
 * Design D4: agent definition / system prompt flow from spec-fixer for consistency.
 * Tool spec ownership is co-located with the Step.
 */
const deltaSpecFixerAgentDefinition: AgentDefinition = {
  name: "specrunner-delta-spec-fixer",
  role: STEP_NAMES.DELTA_SPEC_FIXER,
  model: DELTA_SPEC_FIXER_AGENT_MODEL,
  system: SPEC_FIXER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
  ],
};

/**
 * Build the initial user message for the delta-spec-fixer session.
 * Wraps user-controlled content in XML delimiters for prompt injection protection.
 */
function buildDeltaSpecFixerInitialMessage(opts: {
  slug: string;
  branch: string;
  validationResultPath: string;
}): string {
  const { slug, branch, validationResultPath } = opts;
  return `<user-request>
You are the delta-spec-fixer for the following change:

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}
Validation result: ${validationResultPath}

Please:
1. Read the validation result file at ${validationResultPath}
2. For each violation in the Violations table, move / rename the file to the canonical path \`specs/<capability-name>/spec.md\`
3. If specs/ directory does not exist or contains no delta spec files, create a new delta spec at \`specs/<capability-name>/spec.md\` based on the request.md content and the changes made in this branch
4. Ensure each spec.md has a \`## Requirements\` section header (new format — do NOT use \`## ADDED Requirements\`, \`## MODIFIED Requirements\`, etc.)
5. Ensure each section contains at least one \`### Requirement:\` block
6. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。

Do NOT modify the delta-spec-validation-result.md file itself.
</user-request>`;
}

/**
 * Build the continuation user message for a resumed delta-spec-fixer session.
 */
function buildDeltaSpecFixerContinuationMessage(opts: {
  validationResultPath: string;
  slug: string;
}): string {
  const { validationResultPath } = opts;
  return `<user-request>
前回の修正後に delta-spec-validation から新しい violations が検出されました。

新しい validation result: ${validationResultPath}

前回のセッションの文脈を踏まえて、残っている violations を修正してください。
前回試みたアプローチで不十分だった箇所は別のアプローチを検討してください。

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
</user-request>`;
}

/**
 * DeltaSpecFixerStep: implements the delta-spec-fixer pipeline step.
 *
 * Reuses SPEC_FIXER_SYSTEM_PROMPT (the same spec format rules apply).
 * Input differs: instead of spec-review findings, it reads delta-spec-validation-result.md.
 *
 * Design D4: completionVerdict="approved" → DeltaSpecFixerStep → DeltaSpecValidationStep (loop).
 * counter is independent from spec-review loop (see loopFixerPairs in run.ts).
 */
export const DeltaSpecFixerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.DELTA_SPEC_FIXER,

  agent: deltaSpecFixerAgentDefinition,

  // No custom tool handlers for delta-spec-fixer
  toolHandlers: undefined,

  phase: "spec",

  // completionVerdict: "approved" — delta-spec-fixer has no result file; polling completion
  // maps to "approved" (enabling delta-spec-fixer → delta-spec-validation loop).
  completionVerdict: "approved",

  requiresCommit: true,

  // maxTurns: same as spec-fixer — path/format fixes are mechanical.
  maxTurns: 25,

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.DELTA_SPEC_FIXER);

    const validationResultPath = getLatestStepResult(state, STEP_NAMES.DELTA_SPEC_VALIDATION)?.findingsPath
      ?? deltaSpecValidationResultPath(deps.slug);

    // Session 継続の場合は短縮 prompt
    if (isFixerContinuation(state, STEP_NAMES.DELTA_SPEC_FIXER)) {
      return buildDeltaSpecFixerContinuationMessage({
        validationResultPath,
        slug: deps.slug,
      });
    }

    // 初回は full prompt
    return buildDeltaSpecFixerInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      validationResultPath,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // delta-spec-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // delta-spec-fixer has no file-based verdict
    return NULL_PARSE_RESULT;
  },
};
