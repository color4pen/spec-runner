import type { Verdict } from "../../state/schema.js";

/**
 * A single row in the transition table.
 * Defines: when step `step` produces verdict `on`, go to `to`.
 */
export interface Transition {
  step: string;
  on: Verdict | string;
  to: string | "end" | "escalate";
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
  "spec-review": {
    code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `spec-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review spec-review-result-${nnn}.md and adjust the request manually.`,
  },
  "verification": {
    code: "VERIFICATION_RETRIES_EXHAUSTED",
    message: (n) => `verification did not pass after ${n} iterations`,
    hint: (nnn) => `Review verification-result-${nnn}.md and fix the build errors manually.`,
  },
};

/**
 * Standard pipeline transition table for the propose → spec-review → spec-fixer flow,
 * extended with the implementer → verification ↔ build-fixer flow.
 *
 * propose uses "success" / "error" rather than Verdict because it has no file-based verdict.
 * spec-review and spec-fixer use standard Verdict values.
 * implementer / build-fixer use "success" / "error" (no result file).
 * verification uses "passed" / "failed" / "escalation".
 *
 * Drives Pipeline.runInternal: after each step completes, the table is consulted to
 * determine the next step. "end" terminates the pipeline; "escalate" also terminates
 * (but with escalation semantics). Any other value is the name of the next step to run.
 */
export const STANDARD_TRANSITIONS: Transition[] = [
  { step: "propose",      on: "success",    to: "spec-review" },
  { step: "propose",      on: "error",      to: "escalate" },
  { step: "spec-review",  on: "approved",   to: "implementer" },
  { step: "spec-review",  on: "needs-fix",  to: "spec-fixer" },
  { step: "spec-review",  on: "escalation", to: "escalate" },
  { step: "spec-fixer",   on: "approved",   to: "spec-review" },
  { step: "spec-fixer",   on: "error",      to: "escalate" },
  { step: "implementer",  on: "success",    to: "verification" },
  { step: "implementer",  on: "error",      to: "escalate" },
  { step: "verification", on: "passed",     to: "end" },
  { step: "verification", on: "failed",     to: "build-fixer" },
  { step: "verification", on: "escalation", to: "escalate" },
  { step: "build-fixer",  on: "success",    to: "verification" },
  { step: "build-fixer",  on: "error",      to: "escalate" },
];
