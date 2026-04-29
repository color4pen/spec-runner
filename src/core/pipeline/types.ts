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
 * Standard pipeline transition table for the propose → spec-review → spec-fixer flow.
 *
 * propose uses "success" / "error" rather than Verdict because it has no file-based verdict.
 * spec-review and spec-fixer use standard Verdict values.
 *
 * Drives Pipeline.runInternal: after each step completes, the table is consulted to
 * determine the next step. "end" terminates the pipeline; "escalate" also terminates
 * (but with escalation semantics). Any other value is the name of the next step to run.
 */
export const STANDARD_TRANSITIONS: Transition[] = [
  { step: "propose",     on: "success",    to: "spec-review" },
  { step: "propose",     on: "error",      to: "escalate" },
  { step: "spec-review", on: "approved",   to: "end" },
  { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
  { step: "spec-review", on: "escalation", to: "escalate" },
  { step: "spec-fixer",  on: "approved",   to: "spec-review" },
  { step: "spec-fixer",  on: "error",      to: "escalate" },
];
