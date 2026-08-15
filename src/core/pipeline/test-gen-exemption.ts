/**
 * Pure predicate functions for the test-generation type-gate routing.
 *
 * These predicates are used as `when` guards in STANDARD_TRANSITIONS to bypass
 * test-case-gen / bite-evidence steps for test-generation-exempt request types (e.g. chore).
 * Exempt types route directly from design to spec-review (bypassing test-case-gen),
 * and from implementer directly to verification (bypassing bite-evidence).
 *
 * Since test-materialize is abolished (absorb-test-materialize), all types route
 * spec-review approved → implementer unconditionally. The isTestGenExempt guard
 * is used in 2 places: design → spec-review and implementer → verification.
 *
 * Design: pure functions (state: JobState) → boolean only.
 * No import from types.ts to avoid circular imports.
 * No I/O side effects.
 */
import type { JobState } from "../../state/schema.js";
import { isTestGenRequired } from "../../config/type-config.js";

/**
 * Returns true when the job's request type is test-generation-exempt.
 *
 * Delegates to isTestGenRequired (fail-closed: unknown types return true = not exempt).
 * Used as the `when` guard on:
 *   - DESIGN success → SPEC_REVIEW (bypasses TEST_CASE_GEN for exempt types)
 *   - IMPLEMENTER success → VERIFICATION (bypasses BITE_EVIDENCE for exempt types)
 *
 * @param state - Current job state.
 * @returns true when the request type does not require test generation.
 */
export function isTestGenExempt(state: JobState): boolean {
  return !isTestGenRequired(state.request.type);
}
