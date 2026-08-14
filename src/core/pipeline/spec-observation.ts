/**
 * Pure predicate functions for the spec-phase observation auto-fix routing.
 *
 * These predicates are used as `when` guards in STANDARD_TRANSITIONS to enable
 * the observation auto-fix pattern for spec-review: when spec-review approves with
 * only low/medium routable canon fixable findings, the pipeline routes to spec-fixer
 * to consume those findings and then proceeds directly to test-materialize without
 * re-running spec-review (matching the impl-side observation auto-fix pattern).
 *
 * Design: pure functions (state: JobState) → boolean only.
 * No import from types.ts to avoid circular imports.
 * No I/O side effects.
 */
import type { JobState } from "../../state/schema.js";
import { getLatestJudgeFindings, getConformanceFixContext } from "../step/fixer-helpers.js";
import {
  selectRoutableCanonFindings,
  specReviewEffectiveFixer,
  testCaseGenEffectiveFixer,
} from "../step/canon-escalation.js";
import { buildCanonWriteScopeFromState } from "../step/canon-write-scope.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * Returns true if the latest spec-review run has at least one routable canon fixable finding.
 *
 * "Routable" means the finding is on a spec-fixer-writable canon path
 * (spec.md, design.md, tasks.md). Non-canon fixable findings and unroutable
 * canon fixable findings (request.md, etc.) do NOT count.
 *
 * Used as the `when` guard on the guarded
 * `spec-review approved → spec-fixer` transition row.
 *
 * @param state - Current job state.
 * @returns true when the latest spec-review run has ≥ 1 routable canon fixable finding.
 */
export function specReviewHasRoutableFixables(state: JobState): boolean {
  const findings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW);
  if (!findings || findings.length === 0) return false;
  const canonScope = buildCanonWriteScopeFromState(state);
  return selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer).length > 0;
}

/**
 * Returns true when the spec-fixer entry is an observation auto-fix pass
 * (triggered by a spec-review approved result) rather than a needs-fix re-review
 * or conformance reverification.
 *
 * Conditions for true (both must hold):
 *   1. No active conformance fix context for spec-fixer (getConformanceFixContext returns null)
 *      — ensures this is not a conformance-triggered entry (reverification path)
 *   2. The latest spec-review run verdict is "approved"
 *      — ensures this is the observation pass, not a needs-fix return
 *
 * Used as the `when` guard on the guarded
 * `spec-fixer approved → test-materialize` transition row.
 * (test-case-gen already ran before spec-review; observation pass goes directly to test-materialize)
 *
 * @param state - Current job state.
 * @returns true when spec-fixer should forward directly to test-materialize (observation pass).
 */
export function specFixerObservationForward(state: JobState): boolean {
  // Condition 1: not a conformance-triggered entry.
  //
  // getConformanceFixContext returns non-null only when:
  //   (a) the latest conformance run has verdict `needs-fix:spec-fixer`, AND
  //   (b) conformance.endedAt > spec-review.endedAt (recency check, inclusive >=), AND
  //   (c) the conformance run has toolResult.findings (non-null).
  //
  // All three conditions must hold for this guard to correctly detect a
  // conformance-triggered entry. In production, (b) always holds because the
  // pipeline executes steps sequentially. Test fixtures that simulate a
  // conformance-triggered entry must use ordered timestamps AND provide
  // toolResult.findings on the conformance StepRun; otherwise getConformanceFixContext
  // returns null here and the guard silently passes, routing incorrectly to test-materialize.
  if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;

  // Condition 2: latest spec-review verdict must be "approved" (observation pass entry)
  const runs = state.steps?.[STEP_NAMES.SPEC_REVIEW];
  if (!runs || runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return false;
  return lastRun.outcome.verdict === "approved";
}

/**
 * Returns true when spec-fixer should forward to test-case-gen for TC regeneration
 * (spec-review was needs-fix for TC-routable findings and spec-fixer corrected the spec).
 *
 * Conditions for true (both must hold):
 *   1. No active conformance fix context for spec-fixer (getConformanceFixContext returns null)
 *      — ensures this is not a conformance-triggered entry (reverification path)
 *   2. The latest spec-review run verdict is "needs-fix"
 *      — ensures this is the needs-fix path, not an observation pass
 *
 * Used as the `when` guard on the guarded
 * `spec-fixer approved → test-case-gen` transition row.
 *
 * @param state - Current job state.
 * @returns true when spec-fixer should forward to test-case-gen (needs-fix path).
 */
export function specFixerNeedsFixForward(state: JobState): boolean {
  if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;
  const runs = state.steps?.[STEP_NAMES.SPEC_REVIEW];
  if (!runs || runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return false;
  return lastRun.outcome.verdict === "needs-fix";
}

/**
 * Returns true when the latest spec-review needs-fix is TC-only
 * (test-cases.md findings only; no spec-fixer-routable findings).
 *
 * When true, the pipeline routes spec-review needs-fix directly to test-case-gen
 * (bypassing spec-fixer), since only TC regeneration is required.
 *
 * Conditions for true (both must hold):
 *   1. TC-routable (test-cases.md) fixable findings ≥ 1
 *   2. spec-fixer-routable (spec.md, design.md, tasks.md) fixable findings = 0
 *
 * Used as the `when` guard on the guarded
 * `spec-review needs-fix → test-case-gen` transition row.
 *
 * @param state - Current job state.
 * @returns true when spec-review needs-fix is TC-only (no spec-fixer work needed).
 */
export function specReviewNeedsFixIsTcOnly(state: JobState): boolean {
  const findings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW);
  if (!findings || findings.length === 0) return false;
  const canonScope = buildCanonWriteScopeFromState(state);
  const tcRoutable = selectRoutableCanonFindings(findings, canonScope, testCaseGenEffectiveFixer);
  if (tcRoutable.length === 0) return false;
  const specRoutable = selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer);
  // Non-canon critical/high findings cannot be fixed by either spec-fixer or test-case-gen;
  // their presence means this is not a TC-only needs-fix (operator intervention required).
  const nonCanon = findings.filter(
    (f) => (f.severity === "critical" || f.severity === "high") && !canonScope.canonPaths.has(f.file),
  );
  return specRoutable.length === 0 && nonCanon.length === 0;
}
