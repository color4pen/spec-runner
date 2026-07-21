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
 * Returns true when the latest conformance run's commitOid differs from the
 * latest verification run's commitOid, indicating that the code under review
 * has changed since the last verification run.
 *
 * Use case — reopen + human push:
 *   After `job reopen --from code-review`, a human may push additional commits.
 *   If code-review passes without triggering code-fixer, no specrunner mutator
 *   step runs, so `codeChangedSinceLastVerification` (timestamp-based) returns
 *   false.  But if the human's push advanced HEAD, the conformance run will
 *   record a new commitOid while the last verification run retains the old one.
 *   This predicate detects that mismatch and forces reverification.
 *
 * Fail-closed: returns false when either commitOid is absent (legacy step runs
 * that predate commitOid recording) — the caller falls through to the next
 * matching transition (adr-gen / pr-create), same as before the fix.
 */
export function revisionChangedSinceLastVerification(state: JobState): boolean {
  const verificationRuns = state.steps?.[STEP_NAMES.VERIFICATION] ?? [];
  if (verificationRuns.length === 0) return false;
  const lastVerification = verificationRuns[verificationRuns.length - 1];
  const verificationOid = lastVerification?.commitOid;
  if (!verificationOid) return false;

  const conformanceRuns = state.steps?.[STEP_NAMES.CONFORMANCE] ?? [];
  if (conformanceRuns.length === 0) return false;
  const lastConformance = conformanceRuns[conformanceRuns.length - 1];
  const conformanceOid = lastConformance?.commitOid;
  if (!conformanceOid) return false;

  return conformanceOid !== verificationOid;
}

/**
 * Composite re-verification guard: returns true when reverification is needed
 * because either (a) or (b) holds:
 *
 *   (a) `codeChangedSinceLastVerification` — an impl-phase mutator step (implementer /
 *       build-fixer / code-fixer) ran more recently than the last verification run
 *       (timestamp-based; detects specrunner code changes).
 *
 *   (b) `revisionChangedSinceLastVerification` — the latest conformance run's
 *       commitOid differs from the latest verification run's commitOid
 *       (revision-based; detects human pushes after reopen).
 *
 * Used as the `when` guard for `conformance approved → verification` routing,
 * replacing the earlier `codeChangedSinceLastVerification`-only guard that
 * missed human pushes during reopen recovery.
 */
export function reverificationNeeded(state: JobState): boolean {
  return codeChangedSinceLastVerification(state) || revisionChangedSinceLastVerification(state);
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
 *
 * @deprecated Use `conformanceApprovedForVerifiedRevision` for revision-bound
 * approval checking. This function remains for backward compatibility with tests
 * that explicitly import it.
 */
export function conformanceApprovedLatest(state: JobState): boolean {
  const runs = state.steps?.[STEP_NAMES.CONFORMANCE] ?? [];
  if (runs.length === 0) return false;
  const lastRun = runs[runs.length - 1];
  return lastRun?.outcome?.verdict === "approved";
}

/**
 * Returns true when the most recent conformance run was approved **for the same
 * revision** as the most recent verification run.
 *
 * Revision 照合ルール（D1 / D3 / D6）:
 *   承認はそれが評価した revision に対してのみ有効。
 *   不一致・判定不能（commitOid 欠落）は「承認なし」として routing を false に倒す（fail-closed）。
 *
 * True conditions (all must hold):
 *   (1) Latest conformance run exists and its verdict is "approved".
 *   (2) Latest conformance run has a non-empty commitOid.
 *   (3) Latest verification run exists and has a non-empty commitOid.
 *   (4) conformance.commitOid === verification.commitOid.
 *
 * If any condition is absent, returns false (fail-closed per D6).
 * This function is state-pure: it reads only from `state.steps` and performs
 * no git I/O, ensuring deterministic routing guard behaviour.
 *
 * Distinction from `codeChangedSinceLastVerification` (endedAt-based, auxiliary):
 *   - `codeChangedSinceLastVerification` detects whether a code mutator ran more
 *     recently than the last verification (timestamp comparison). Used for the
 *     conformance→verification re-entry guard.
 *   - `conformanceApprovedForVerifiedRevision` detects whether the conformance
 *     approval matches the currently verified revision (commitOid comparison).
 *     Used for the verification→adr-gen / verification→pr-create short-circuit guard.
 *
 * STANDARD / FAST profile usage:
 *   `{ step: VERIFICATION, on: "passed", to: ADR_GEN|PR_CREATE, when: conformanceApprovedForVerifiedRevision }`
 *   Replaces the old `conformanceApprovedLatest` guard in types.ts.
 */
export function conformanceApprovedForVerifiedRevision(state: JobState): boolean {
  // (1) Latest conformance run must exist with "approved" verdict
  const conformanceRuns = state.steps?.[STEP_NAMES.CONFORMANCE] ?? [];
  if (conformanceRuns.length === 0) return false;
  const lastConformance = conformanceRuns[conformanceRuns.length - 1];
  if (lastConformance?.outcome?.verdict !== "approved") return false;

  // (2) Conformance run must have a non-empty commitOid
  const conformanceOid = lastConformance.commitOid;
  if (!conformanceOid) return false;

  // (3) Latest verification run must exist and have a non-empty commitOid
  const verificationRuns = state.steps?.[STEP_NAMES.VERIFICATION] ?? [];
  if (verificationRuns.length === 0) return false;
  const lastVerification = verificationRuns[verificationRuns.length - 1];
  const verificationOid = lastVerification?.commitOid;
  if (!verificationOid) return false;

  // (4) Both commitOids must match
  return conformanceOid === verificationOid;
}
