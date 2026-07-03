/**
 * Regression-gate step factory.
 *
 * The regression-gate runs after all reviewer chains (code-review + custom reviewers)
 * have converged, before conformance. It verifies that previously-fixed findings
 * have not regressed in the final code.
 *
 * Design:
 * - Step name "regression-gate" is NOT in STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES
 *   (D8: injected dynamically like custom reviewers).
 * - reportTool = JUDGE_REPORT_TOOL (singleton identity) so executor's isJudgeStep
 *   identity check (=== JUDGE_REPORT_TOOL) works without modification.
 * - reads() returns gitState only — the findings ledger is injected into the user message
 *   from state (no separate file read required).
 * - writes() / resultFilePath() use resolveReviewerResultPath (non-code-review path)
 *   → regression-gate-result-NNN.md
 */
import type { AgentStep, StepDeps, ParsedStepResult, IoRef } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { AgentStepName } from "../../state/schema.js";
import type { JobState } from "../../state/schema.js";
import { REGRESSION_GATE_SYSTEM_PROMPT } from "../../prompts/regression-gate-system.js";
import { resolveReviewerResultPath, changeFolderPath } from "../../util/paths.js";
import { nextIteration } from "./io-iteration.js";
import { JUDGE_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";
import { collectFindingsLedger } from "../pipeline/findings-ledger.js";
import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js";
import { deriveRegressionGateVerdict } from "./judge-verdict.js";
import { buildFindingsBlock } from "./fixer-helpers.js";
import type { Finding } from "../../kernel/report-result.js";

/**
 * Canonical step name for the regression-gate.
 * NOT added to STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES (D8: dynamic injection only).
 */
export const REGRESSION_GATE_STEP_NAME = "regression-gate";

/**
 * Maximum number of fix iterations for the regression-gate loop.
 * Small bounded value: the gate verifies a fixed ledger set; convergence is guaranteed
 * as long as each fixer pass resolves at least one item without introducing new contradictions.
 */
export const REGRESSION_GATE_MAX_ITERATIONS = 3;

/** Default review model for the regression-gate agent. */
const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6";

/**
 * Format the findings ledger for injection into the user message.
 * Empty ledger → single-line notice; non-empty → formatted block per finding.
 */
function buildLedgerBlock(findings: Finding[]): string {
  if (findings.length === 0) {
    return "## Findings Ledger\n\nNo fixable findings were recorded in the reviewer chain. Approve immediately with an empty findings array.";
  }
  return `## Findings Ledger (${findings.length} item${findings.length === 1 ? "" : "s"})\n\nThe following findings were fixed during this job. Verify each one is still fixed in the current code.\n\n${buildFindingsBlock(findings)}`;
}

/**
 * Create an AgentStep for the regression-gate.
 *
 * The returned step:
 * - Uses JUDGE_REPORT_TOOL (singleton identity) so executor's isJudgeStep check fires.
 * - Uses resolveReviewerResultPath for result file identification.
 * - Has needsProjectContext: true and gitWrite: true like other reviewer steps.
 * - reads() returns only gitState — no required reviewer result files.
 */
export function createRegressionGateStep(): AgentStep {
  const agentDef: AgentDefinition = {
    name: "specrunner-regression-gate",
    // Type assertion: regression-gate is not in the standard AgentStepName union (D8).
    role: REGRESSION_GATE_STEP_NAME as AgentStepName,
    model: DEFAULT_REVIEW_MODEL,
    system: REGRESSION_GATE_SYSTEM_PROMPT,
    tools: [
      { type: AGENT_TOOLSET_TYPE },
      toCustomToolSpec(JUDGE_REPORT_TOOL),
    ],
    capabilities: { gitWrite: true },
  };

  return {
    kind: "agent",
    name: REGRESSION_GATE_STEP_NAME,

    agent: agentDef,

    toolHandlers: undefined,

    needsProjectContext: true,
    // Use JUDGE_REPORT_TOOL singleton — executor isJudgeStep identity check (=== JUDGE_REPORT_TOOL)
    reportTool: JUDGE_REPORT_TOOL,

    // Custom verdict derivation: any fixable finding (even low/medium severity) triggers needs-fix.
    // Standard deriveJudgeVerdict only triggers needs-fix for critical/high severity.
    judgeVerdictFn: deriveRegressionGateVerdict,

    // maxTurns: ledger-based verification; no open-ended review. 20 matches custom-reviewer default.
    maxTurns: 20,

    reads(_state: JobState, _deps: StepDeps): IoRef[] {
      // Ledger is embedded from state in buildMessage; no required file inputs.
      return [
        { path: ".", artifact: "gitState" },
      ];
    },

    writes(state: JobState, deps: StepDeps): IoRef[] {
      const iteration = nextIteration(state, REGRESSION_GATE_STEP_NAME);
      return [
        { path: resolveReviewerResultPath(deps.slug, REGRESSION_GATE_STEP_NAME, iteration) },
      ];
    },

    buildMessage(state: JobState, deps: StepDeps): string {
      const iteration = nextIteration(state, REGRESSION_GATE_STEP_NAME);
      const resultPath = resolveReviewerResultPath(deps.slug, REGRESSION_GATE_STEP_NAME, iteration);
      const changeFolder = changeFolderPath(deps.slug);

      // Build the ledger from all reviewer chain steps (excludes this gate).
      const reviewerChain = deriveImplReviewerChain(state);
      const ledger = collectFindingsLedger(state, reviewerChain);

      const ledgerBlock = buildLedgerBlock(ledger);

      return `<user-request>
You are the regression-gate for the following change:

Change folder: ${changeFolder}
Iteration: ${iteration}
Result file: ${resultPath}

${ledgerBlock}

Verification steps:
1. Run \`git diff main...HEAD\` to see all changes made in this branch.
2. For each finding in the ledger above, read the relevant file and verify the fix is still present.
3. Report any regressions (findings that are back) with severity=high / resolution=fixable.
4. Report contradictions (fixing A re-introduces B) with resolution=decision-needed.
5. If ledger is empty → call \`report_result\` with findings=[] immediately.
6. Write your result to: ${resultPath}

The file MUST contain a verdict line: \`- **verdict**: <approved|needs-fix|escalation>\`

Original request:
${deps.request.content}
</user-request>

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。`;
    },

    resultFilePath(state: JobState, deps: StepDeps): string {
      const iteration = nextIteration(state, REGRESSION_GATE_STEP_NAME);
      return resolveReviewerResultPath(deps.slug, REGRESSION_GATE_STEP_NAME, iteration);
    },

    parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
      // R4 contract: prose-verdict parse path is dead; executor uses typed toolResult.
      return { verdict: null, findingsPath: null };
    },
  };
}
