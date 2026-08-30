/**
 * Pure routing functions for the reviewer chain, fixer chain, and conformance routing.
 *
 * This module is the neutral pure boundary between pipeline composition and step factories.
 * Dependency direction: pipeline composition → review-routing ← step factories.
 *
 * Constraints:
 * - No value imports from core/pipeline/ composition modules or core/step/ factory modules.
 * - Type-only imports from those modules are permitted.
 * - Value imports: step/step-names, step/judge-verdict, decision/decision-ledger only.
 *
 * All functions are pure (no side effects, no I/O).
 */
import type { JobState } from "../state/schema.js";
import type { ReviewerSnapshot } from "./reviewers/types.js";
import type { Finding } from "../kernel/report-result.js";
import { STEP_NAMES } from "./step/step-names.js";

/**
 * Canonical step name for the regression-gate.
 * NOT added to STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES (D8: dynamic injection only).
 */
export const REGRESSION_GATE_STEP_NAME = "regression-gate";

/**
 * Derive the full reviewer chain for the impl phase from job state.
 * Returns ["code-review", ...customReviewerNames] in declaration order.
 *
 * @param stateOrSnapshots - Either a JobState (uses state.reviewers) or a ReviewerSnapshot[].
 */
export function deriveImplReviewerChain(
  stateOrSnapshots: JobState | ReviewerSnapshot[],
): string[] {
  const snapshots = Array.isArray(stateOrSnapshots)
    ? stateOrSnapshots
    : (stateOrSnapshots as JobState).reviewers ?? [];
  return [STEP_NAMES.CODE_REVIEW, ...snapshots.map((s) => s.name)];
}

/**
 * Derive the full fixer chain for code-fixer (reviewer chain + regression-gate when applicable).
 *
 * Returns ["code-review"] when no custom reviewers are present (zero-reviewer case).
 * Returns ["code-review", ...customNames, "regression-gate"] when custom reviewers are present.
 *
 * @param state - Current job state.
 */
export function deriveImplFixerChain(state: JobState): string[] {
  const chain = deriveImplReviewerChain(state);
  const hasReviewers = (state.reviewers?.length ?? 0) > 0;
  if (hasReviewers) {
    return [...chain, REGRESSION_GATE_STEP_NAME];
  }
  return chain;
}

/**
 * Resolve the currently active reviewer from job state.
 *
 * The active reviewer is the one with the most recent execution (latest startedAt).
 * Tie-breaking: when two reviewers share the same startedAt, the later one in the
 * chain wins (>= preserves the last write in declaration order).
 *
 * @param state - Current job state.
 * @param chain - Reviewer chain from deriveImplReviewerChain.
 */
export function resolveActiveReviewer(state: JobState, chain: string[]): string {
  let latestTime = "";
  let activeReviewer = chain[0] ?? STEP_NAMES.CODE_REVIEW;

  for (const reviewer of chain) {
    const runs = state.steps?.[reviewer] ?? [];
    if (runs.length === 0) continue;
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.startedAt >= latestTime) {
      latestTime = lastRun.startedAt;
      activeReviewer = reviewer;
    }
  }

  return activeReviewer;
}

/**
 * Return the next step after the given reviewer in the chain.
 * Returns STEP_NAMES.CONFORMANCE if the reviewer is the last in the chain.
 *
 * @param reviewer - Current reviewer step name.
 * @param chain    - Full reviewer chain.
 */
export function nextAfterReviewer(reviewer: string, chain: string[]): string {
  const idx = chain.indexOf(reviewer);
  if (idx === -1 || idx === chain.length - 1) {
    return STEP_NAMES.CONFORMANCE;
  }
  return chain[idx + 1]!;
}

/**
 * Get the findings from the most recent judge run for the given step.
 * Returns the findings array from the last StepRun's toolResult, or null if:
 * - The step has no runs
 * - The last run has no toolResult (legacy state)
 * - The last run's toolResult has no findings
 */
export function getLatestJudgeFindings(
  state: JobState,
  judgeStepName: string,
): Finding[] | null {
  const runs = state.steps?.[judgeStepName];
  if (!runs || runs.length === 0) return null;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return null;
  const toolResult = lastRun.outcome.toolResult;
  if (!toolResult) return null;
  const findings = (toolResult as { findings?: Finding[] }).findings;
  if (!findings) return null;
  return findings;
}

/**
 * Resolve the predecessor step name for conformance recency checking.
 *
 * When conformance routes to a fixer, the fixer's "predecessor" (last step that ran
 * in the normal flow before conformance) differs per fixer:
 *   - code-fixer: the active reviewer (code-review or custom reviewer)
 *   - spec-fixer: spec-review
 *   - implementer: implementer itself (its previous run)
 */
function conformancePredecessorStep(state: JobState, stepName: string): string {
  if (stepName === STEP_NAMES.CODE_FIXER) {
    return resolveActiveReviewer(state, deriveImplFixerChain(state));
  }
  if (stepName === STEP_NAMES.SPEC_FIXER) {
    return STEP_NAMES.SPEC_REVIEW;
  }
  // implementer: predecessor is itself (its most recent prior run)
  return STEP_NAMES.IMPLEMENTER;
}

/**
 * Get conformance findings for injection into a fixer step context.
 *
 * Returns the findings from the latest conformance run if:
 * 1. Conformance has run and has a `needs-fix:<target>` verdict matching stepName
 * 2. The conformance run is more recent than the predecessor step's last run
 *    (ensures we only inject when conformance triggered this fixer entry)
 * 3. The conformance run has findings in toolResult
 *
 * Returns null in all other cases (no conformance run, stale conformance, wrong target,
 * predecessor ran after conformance indicating a normal non-conformance entry).
 *
 * Pure function — no I/O.
 */
export function getConformanceFixContext(state: JobState, stepName: string): Finding[] | null {
  // Step 1: get latest conformance run
  const conformanceRuns = state.steps?.[STEP_NAMES.CONFORMANCE];
  if (!conformanceRuns || conformanceRuns.length === 0) return null;
  const latestConformance = conformanceRuns[conformanceRuns.length - 1];
  if (!latestConformance) return null;

  // Step 2: check verdict is needs-fix:<target> for this stepName
  const verdict = latestConformance.outcome.verdict;
  if (typeof verdict !== "string") return null;
  const needsFixPrefix = "needs-fix:";
  if (!verdict.startsWith(needsFixPrefix)) return null;
  const target = verdict.slice(needsFixPrefix.length);
  if (target !== stepName) return null;

  // Step 3: recency — conformance must be newer than the predecessor's last run.
  //
  // LOAD-BEARING: the inclusive `>=` is intentional. In production the pipeline
  // executes steps sequentially, so conformance.endedAt is always strictly greater
  // than predecessor.endedAt. The `>=` correctly handles that case AND also
  // returns null for the degenerate equal-timestamp state.
  //
  // INVARIANT for callers that depend on this function as a conformance-entry guard
  // (e.g. specFixerForwardsToTestGen in spec-observation.ts): test fixtures that
  // represent a conformance-triggered entry MUST use distinct, ordered timestamps
  // (predecessor.endedAt < conformance.endedAt) AND must provide toolResult.findings
  // (step 4) for the function to return non-null. Fixtures with equal timestamps will
  // produce a false null (not-a-conformance-entry) result via this step.
  const predecessorName = conformancePredecessorStep(state, stepName);
  const predecessorRuns = state.steps?.[predecessorName];
  if (predecessorRuns && predecessorRuns.length > 0) {
    const latestPredecessor = predecessorRuns[predecessorRuns.length - 1];
    if (latestPredecessor && latestPredecessor.endedAt >= latestConformance.endedAt) {
      // Predecessor ran after (or at the same time as) conformance → not a conformance-triggered entry
      return null;
    }
  }

  // Step 4: return findings from toolResult.
  //
  // NOTE: callers that use the non-null return value solely as a boolean guard
  // (e.g. specFixerForwardsToTestGen) depend on this step returning non-null.
  // Test fixtures must therefore populate toolResult.findings on the conformance
  // StepRun to correctly simulate a conformance-triggered entry.
  const toolResult = latestConformance.outcome.toolResult;
  if (!toolResult) return null;
  const findings = (toolResult as { findings?: Finding[] }).findings;
  if (!findings) return null;
  return findings;
}

/**
 * True when conformance has triggered this code-fixer entry.
 *
 * Design D7 (reviewer-parallel-execution): code-fixer in the composed path routes
 * back via priority-ordered predicates instead of resolveActiveReviewer.
 * Priority 1: conformance fix in progress → return to conformance.
 *
 * Delegates to getConformanceFixContext — same recency-based detection used in
 * buildMessage(). No new seam introduced.
 */
export function conformanceFixInProgress(state: JobState): boolean {
  return getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) !== null;
}

/**
 * True when the regression-gate is the active fixer source.
 *
 * Design D7 (reviewer-parallel-execution): priority 2 after conformance.
 * regression-gate triggered this fixer entry when:
 * - the regression-gate's latest verdict is "needs-fix".
 *
 * Note: after D2 (excludeKnownUnfixedRegressions removal), deriveRegressionGateVerdict
 * converts any fixable finding to needs-fix regardless of severity. The approved+fixable
 * branch is structurally unreachable and has been removed.
 */
export function regressionGateActive(state: JobState): boolean {
  const runs = state.steps?.[REGRESSION_GATE_STEP_NAME] ?? [];
  if (runs.length === 0) return false;
  const last = runs[runs.length - 1];
  if (!last) return false;
  return last.outcome.verdict === "needs-fix";
}

/**
 * True when code-review (the standard built-in reviewer) is still in its convergence loop.
 *
 * Design D7 (reviewer-parallel-execution): priority 3 after regression-gate.
 * code-review loop is active when:
 * - the coordinator (parallelReview) has NOT started yet (no runs on coordinator), AND
 * - code-review's latest verdict is "needs-fix" (i.e. the fixer was sent by code-review)
 *
 * @param state           - Current job state.
 * @param coordinatorName - Name of the coordinator step (e.g. "custom-reviewers").
 */
export function codeReviewLoopActive(state: JobState, coordinatorName: string): boolean {
  // If coordinator has run at least once, we are past the code-review loop
  const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
  if (coordinatorRuns.length > 0) return false;

  const codeReviewRuns = state.steps?.[STEP_NAMES.CODE_REVIEW] ?? [];
  if (codeReviewRuns.length === 0) return false;
  const lastCodeReview = codeReviewRuns[codeReviewRuns.length - 1];
  return lastCodeReview?.outcome.verdict === "needs-fix";
}
