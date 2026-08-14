/**
 * Pure predicate functions for the test-generation type-gate routing.
 *
 * These predicates are used as `when` guards in STANDARD_TRANSITIONS to bypass
 * test-case-gen / test-materialize / bite-evidence steps for test-generation-exempt
 * request types (e.g. chore). Exempt types route directly from spec-review (or
 * spec-fixer observation pass) to implementer, and from implementer directly to
 * verification.
 *
 * Design: pure functions (state: JobState) → boolean only.
 * No import from types.ts to avoid circular imports.
 * No I/O side effects.
 */
import type { JobState } from "../../state/schema.js";
import { isTestGenRequired } from "../../config/type-config.js";
import { specFixerObservationForward } from "./spec-observation.js";

/**
 * Returns true when the job's request type is test-generation-exempt.
 *
 * Delegates to isTestGenRequired (fail-closed: unknown types return true = not exempt).
 * Used as the `when` guard on:
 *   - SPEC_REVIEW approved → IMPLEMENTER (bypasses TEST_CASE_GEN)
 *   - IMPLEMENTER success → VERIFICATION (bypasses BITE_EVIDENCE)
 *
 * @param state - Current job state.
 * @returns true when the request type does not require test generation.
 */
export function isTestGenExempt(state: JobState): boolean {
  return !isTestGenRequired(state.request.type);
}

/**
 * Returns true when spec-fixer should forward to implementer (not test-case-gen)
 * because this is an observation auto-fix pass on a test-generation-exempt type.
 *
 * AND composition: specFixerForwardsToTestGen (confirms this is an observation pass,
 * not a conformance/needs-fix path) AND isTestGenExempt (confirms the type is exempt).
 *
 * Used as the `when` guard on:
 *   - SPEC_FIXER approved → IMPLEMENTER (exempt type's observation forward path)
 *
 * ⚠ Fixture invariant (inherited from specFixerForwardsToTestGen):
 * The conformance-path exclusion inside specFixerForwardsToTestGen requires:
 *   (a) conformance StepRun has verdict `needs-fix:spec-fixer`, AND
 *   (b) conformance.endedAt >= spec-review.endedAt (ordered timestamps), AND
 *   (c) conformance StepRun has toolResult.findings (non-null).
 * Test fixtures that simulate a conformance-triggered entry MUST supply ordered
 * timestamps AND toolResult.findings; omitting either causes getConformanceFixContext
 * to return null, making the guard silently pass and route to implementer incorrectly.
 *
 * @param state - Current job state.
 * @returns true when spec-fixer should forward to implementer (exempt observation pass).
 */
export function specFixerForwardsToImplementer(state: JobState): boolean {
  return specFixerObservationForward(state) && isTestGenExempt(state);
}
