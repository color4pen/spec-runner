import type { Verdict, JobState } from "../../state/schema.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * A single row in the transition table.
 * Defines: when step `step` produces verdict `on`, go to `to`.
 *
 * `when` is an optional context predicate. When defined, the transition only
 * fires if `when(state)` returns true. This enables context-aware routing
 * (e.g. 2nd-phase delta-spec-validation → adr-gen after code-review).
 */
export interface Transition {
  step: string;
  on: Verdict | string;
  to: string | "end" | "escalate";
  when?: (state: JobState) => boolean;
}

/**
 * Error shape for loop exhaustion events.
 * Used by LOOP_ERROR_CODES lookup table.
 */
export interface LoopErrorShape {
  code: string;
  message: (maxIterations: number) => string;
  hint: (nnn: string) => string;
}

/**
 * Lookup table: loop name → error shape for exhaustion events.
 * Replaces hardcoded SPEC_REVIEW_RETRIES_EXHAUSTED logic in Pipeline.handleExhausted.
 * Add new cycle entries here without touching Pipeline source code.
 */
export const LOOP_ERROR_CODES: Record<string, LoopErrorShape> = {
  [STEP_NAMES.SPEC_REVIEW]: {
    code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `spec-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review spec-review-result-${nnn}.md and adjust the request manually.`,
  },
  [STEP_NAMES.VERIFICATION]: {
    code: "VERIFICATION_RETRIES_EXHAUSTED",
    message: (n) => `verification did not pass after ${n} iterations`,
    hint: (nnn) => `Review verification-result-${nnn}.md and fix the build errors manually.`,
  },
  [STEP_NAMES.CODE_REVIEW]: {
    code: "CODE_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `code-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review review-feedback-${nnn}.md and address findings manually.`,
  },
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: {
    code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED",
    message: (n) => `delta-spec-validation did not pass after ${n} iterations`,
    // _nnn is intentionally unused: the result file is delta-spec-validation-result.md
    // (no iteration suffix) because it is overwritten each iteration with the latest violations.
    hint: (_nnn) => `Review delta-spec-validation-result.md and fix path/format violations manually.`,
  },
};

/**
 * Standard pipeline transition table for the design → delta-spec-validation → spec-review
 * flow, extended with the implementer → verification ↔ build-fixer flow and a 2nd-phase
 * delta-spec-validation after code-review.
 *
 * design uses "success" / "error" rather than Verdict because it has no file-based verdict.
 * spec-review and spec-fixer use standard Verdict values.
 * delta-spec-validation uses "approved" / "needs-fix" / "escalation".
 * delta-spec-fixer uses "approved" / "error".
 * implementer / build-fixer use "success" / "error" (no result file).
 * verification uses "passed" / "failed" / "escalation".
 *
 * Drives Pipeline.runInternal: after each step completes, the table is consulted to
 * determine the next step. "end" terminates the pipeline; "escalate" also terminates
 * (but with escalation semantics). Any other value is the name of the next step to run.
 *
 * Context-aware routing:
 * - delta-spec-validation approved → adr-gen (2nd phase, after code-review): fires when
 *   state.steps["code-review"] has at least one attempt (i.e. code-review already ran).
 * - delta-spec-validation approved → spec-review (1st phase, after design): fallback when
 *   the conditional above does not match.
 * - The delta-spec-fixer loop (needs-fix → delta-spec-fixer → delta-spec-validation) works
 *   identically in both phases because its rows have no `when` predicate.
 */
export const STANDARD_TRANSITIONS: Transition[] = [
  // design → delta-spec-validation (replaces old design → spec-review)
  { step: STEP_NAMES.DESIGN,                on: "success",    to: STEP_NAMES.DELTA_SPEC_VALIDATION },
  { step: STEP_NAMES.DESIGN,                on: "error",      to: "escalate" },
  // --- delta-spec-validation loop ---
  // 2nd phase (after code-review): approved → adr-gen (conditional — must precede the fallback row)
  { step: STEP_NAMES.DELTA_SPEC_VALIDATION, on: "approved",   to: STEP_NAMES.ADR_GEN,
    when: (s) => (s.steps?.["code-review"]?.length ?? 0) > 0 },
  // 1st phase (after design): approved → spec-review (fallback, no `when`)
  { step: STEP_NAMES.DELTA_SPEC_VALIDATION, on: "approved",   to: STEP_NAMES.SPEC_REVIEW },
  { step: STEP_NAMES.DELTA_SPEC_VALIDATION, on: "needs-fix",  to: STEP_NAMES.DELTA_SPEC_FIXER },
  { step: STEP_NAMES.DELTA_SPEC_VALIDATION, on: "escalation", to: "escalate" },
  { step: STEP_NAMES.DELTA_SPEC_FIXER,      on: "approved",   to: STEP_NAMES.DELTA_SPEC_VALIDATION },
  { step: STEP_NAMES.DELTA_SPEC_FIXER,      on: "error",      to: "escalate" },
  // --- spec-review loop ---
  { step: STEP_NAMES.SPEC_REVIEW,           on: "approved",   to: STEP_NAMES.TEST_CASE_GEN },
  { step: STEP_NAMES.TEST_CASE_GEN,         on: "success",    to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.TEST_CASE_GEN,         on: "error",      to: "escalate" },
  { step: STEP_NAMES.SPEC_REVIEW,           on: "needs-fix",  to: STEP_NAMES.SPEC_FIXER },
  { step: STEP_NAMES.SPEC_REVIEW,           on: "escalation", to: "escalate" },
  // spec-fixer → delta-spec-validation (replaces old spec-fixer → spec-review)
  { step: STEP_NAMES.SPEC_FIXER,            on: "approved",   to: STEP_NAMES.DELTA_SPEC_VALIDATION },
  { step: STEP_NAMES.SPEC_FIXER,            on: "error",      to: "escalate" },
  { step: STEP_NAMES.IMPLEMENTER,           on: "success",    to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.IMPLEMENTER,           on: "error",      to: "escalate" },
  { step: STEP_NAMES.VERIFICATION,          on: "passed",     to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.VERIFICATION,          on: "failed",     to: STEP_NAMES.BUILD_FIXER },
  { step: STEP_NAMES.VERIFICATION,          on: "escalation", to: "escalate" },
  { step: STEP_NAMES.BUILD_FIXER,           on: "success",    to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BUILD_FIXER,           on: "error",      to: "escalate" },
  // --- code review loop ---
  // code-review approved → delta-spec-validation (2nd phase validation before adr-gen)
  { step: STEP_NAMES.CODE_REVIEW,           on: "approved",   to: STEP_NAMES.DELTA_SPEC_VALIDATION },
  { step: STEP_NAMES.CODE_REVIEW,           on: "needs-fix",  to: STEP_NAMES.CODE_FIXER },
  { step: STEP_NAMES.CODE_REVIEW,           on: "escalation", to: "escalate" },
  { step: STEP_NAMES.CODE_FIXER,            on: "approved",   to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.CODE_FIXER,            on: "error",      to: "escalate" },
  // --- adr-gen (single shot, after 2nd-phase delta-spec-validation approved) ---
  { step: STEP_NAMES.ADR_GEN,              on: "success",    to: STEP_NAMES.PR_CREATE },
  { step: STEP_NAMES.ADR_GEN,              on: "error",      to: "escalate" },
  // --- pr-create (single shot, no loop) ---
  { step: STEP_NAMES.PR_CREATE,             on: "success",    to: "end" },
  { step: STEP_NAMES.PR_CREATE,             on: "error",      to: "escalate" },
];
