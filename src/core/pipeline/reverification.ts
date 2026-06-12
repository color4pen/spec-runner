/**
 * Re-verification predicates for the post-fixer reverification chokepoint.
 *
 * These pure functions are used as `when` guards in STANDARD_TRANSITIONS to
 * ensure that the last code change made by an impl-phase mutator step (implementer,
 * build-fixer, code-fixer) is always covered by a verification run before pr-create.
 *
 * Design ref: design.md D2 / D3 / D4 (post-fixer-reverification)
 */
import type { JobState } from "../../state/schema.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * Impl-phase steps whose execution may mutate source code.
 * Used to compute the maximum "last code-change" timestamp.
 * Spec-phase fixers (spec-fixer) are excluded because their downstream path
 * always passes through implementer → verification before reaching conformance.
 */
export const IMPL_CODE_MUTATOR_STEPS = [
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_FIXER,
] as const;

/**
 * Returns true when any impl-phase code-mutator step has run more recently
 * than the most recent verification run.
 *
 * Algorithm:
 *   vTime = max endedAt of all verification runs (or "" when none exist)
 *   mTime = max endedAt of all IMPL_CODE_MUTATOR_STEPS runs (or "" when none exist)
 *   return mTime > vTime  (ISO 8601 lexicographic comparison)
 *
 * When true, conformance approved should route to verification (re-verify).
 * When false, verification already covers the last code change — skip re-verify.
 */
export function codeChangedSinceLastVerification(state: JobState): boolean {
  const verificationRuns = state.steps?.[STEP_NAMES.VERIFICATION] ?? [];
  const vTime = verificationRuns.reduce(
    (max, run) => (run.endedAt > max ? run.endedAt : max),
    "",
  );

  let mTime = "";
  for (const stepName of IMPL_CODE_MUTATOR_STEPS) {
    const runs = state.steps?.[stepName] ?? [];
    for (const run of runs) {
      if (run.endedAt > mTime) mTime = run.endedAt;
    }
  }

  return mTime > vTime;
}

/**
 * Returns true when the most recent conformance run has verdict "approved".
 *
 * Used as the `when` guard for `verification passed → adr-gen`.
 * When true, verification is completing in re-verification context (conformance
 * already approved) and should advance to adr-gen rather than re-entering
 * the code-review loop.
 *
 * Health invariant: conformance only runs after code-review approved, so this
 * predicate is true only in re-verification context — never during initial
 * verification (implementer → verification, where conformance has not yet run).
 */
export function conformanceApprovedLatest(state: JobState): boolean {
  const runs = state.steps?.[STEP_NAMES.CONFORMANCE] ?? [];
  if (runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  return lastRun?.outcome?.verdict === "approved";
}
