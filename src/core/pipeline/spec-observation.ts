/**
 * Pure predicate functions for the spec-phase observation auto-fix routing.
 *
 * These predicates are used as `when` guards in STANDARD_TRANSITIONS to enable
 * the observation auto-fix pattern for spec-review: when spec-review approves with
 * only low/medium routable canon fixable findings, the pipeline routes to spec-fixer
 * to consume those findings and then proceeds directly to test-case-gen without
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
} from "../step/canon-escalation.js";
import { buildCanonWriteScopeFromState } from "../step/canon-write-scope.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * Returns true if the latest spec-review run has at least one routable canon fixable finding.
 *
 * "Routable" means the finding is on a spec-fixer-writable canon path
 * (spec.md, design.md, tasks.md). Non-canon fixable findings and unroutable
 * canon fixable findings (request.md, test-cases.md, attestation) do NOT count.
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
 * `spec-fixer approved → test-case-gen` transition row.
 *
 * @param state - Current job state.
 * @returns true when spec-fixer should forward directly to test-case-gen.
 */
export function specFixerForwardsToTestGen(state: JobState): boolean {
  // Condition 1: not a conformance-triggered entry
  if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;

  // Condition 2: latest spec-review verdict must be "approved" (observation pass entry)
  const runs = state.steps?.[STEP_NAMES.SPEC_REVIEW];
  if (!runs || runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return false;
  return lastRun.outcome.verdict === "approved";
}
