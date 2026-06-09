import type { Verdict, JobState } from "../../state/schema.js";
import { STEP_NAMES } from "../step/step-names.js";
import type { CodeReviewReportResult } from "../port/report-result.js";
import type { Step } from "../step/types.js";

/**
 * Pipeline-level role of a step (convergence / resume semantics).
 * creator  — generates the phase artifact; one per phase.
 * reviewer — verdict-driven loop step; one per phase; retry exhaustion re-routes to paired fixer.
 * fixer    — repairs findings from a reviewer or gate; may have multiple per phase.
 * gate     — deterministic check or linear-progress step (verification, pr-create, etc.).
 */
export type StepRole = "creator" | "reviewer" | "fixer" | "gate";

/** Pipeline phase a step belongs to. */
export type StepPhase = "spec" | "impl";

/** Role and phase declared per step in a PipelineDescriptor. */
export interface StepRoleEntry {
  role: StepRole;
  phase: StepPhase;
}

/**
 * Declarative description of a complete pipeline configuration.
 * Registry maps pipeline identifiers to their corresponding descriptor.
 * Consumers build Pipeline instances from a descriptor via buildPipeline().
 */
export interface PipelineDescriptor {
  /** Unique pipeline identifier (matches PIPELINE_IDS entries). */
  id: string;
  /** Ordered step entries: [stepName, Step] pairs that form the pipeline's Map. */
  steps: readonly (readonly [string, Step])[];
  /** Transition table driving the state machine. */
  transitions: readonly Transition[];
  /** Primary loop step name used for stdout progress output. */
  loopName: string;
  /** All loop step names (includes loopName and any additional loops). */
  loopNames: readonly string[];
  /** Mapping: review step name → paired fixer step name. */
  loopFixerPairs: Readonly<Record<string, string>>;
  /** Step name where pipeline.run() begins for a fresh execution. */
  startStep: string;
  /** Override for Pipeline's maxIterations. When absent, resolved from config. */
  maxIterations?: number;
  /**
   * Role and phase for each step in the pipeline.
   * Used by resume resolution and pipeline convergence semantics.
   * Keys are step names; values declare the role and phase.
   * Invariant: each phase has exactly one creator and exactly one reviewer.
   */
  roles: Readonly<Record<string, StepRoleEntry>>;
  /**
   * Step name used for the pipeline summary output (pipeline:summary event).
   * When absent (or the step is not in the pipeline), no summary is emitted.
   */
  summaryStep?: string;
}

/**
 * A single row in the transition table.
 * Defines: when step `step` produces verdict `on`, go to `to`.
 *
 * `when` is an optional context predicate. When defined, the transition only
 * fires if `when(state)` returns true. This enables context-aware routing
 * (e.g. code-review approved with fixableCount > 0 → code-fixer).
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
  [STEP_NAMES.CONFORMANCE]: {
    code: "CONFORMANCE_RETRIES_EXHAUSTED",
    message: (n) => `conformance did not approve after ${n} iterations`,
    hint: (nnn) => `Review conformance-result-${nnn}.md and fix the implementation manually.`,
  },
};

/**
 * Standard pipeline transition table.
 *
 * design uses "success" / "error" rather than Verdict because it has no file-based verdict.
 * spec-review and spec-fixer use standard Verdict values.
 * implementer / build-fixer use "success" / "error" (no result file).
 * verification uses "passed" / "failed" / "escalation".
 *
 * Drives Pipeline.runInternal: after each step completes, the table is consulted to
 * determine the next step. "end" terminates the pipeline; "escalate" also terminates
 * (but with escalation semantics). Any other value is the name of the next step to run.
 */
export const STANDARD_TRANSITIONS: Transition[] = [
  // --- request-review gate (first step) ---
  { step: STEP_NAMES.REQUEST_REVIEW, on: "approve",           to: STEP_NAMES.DESIGN },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "needs-discussion",  to: "escalate" },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "reject",            to: "escalate" },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "error",             to: "escalate" },
  // design → spec-review (direct)
  { step: STEP_NAMES.DESIGN,      on: "success",   to: STEP_NAMES.SPEC_REVIEW },
  { step: STEP_NAMES.DESIGN,      on: "error",     to: "escalate" },
  // --- spec-review loop ---
  { step: STEP_NAMES.SPEC_REVIEW, on: "approved",  to: STEP_NAMES.TEST_CASE_GEN },
  { step: STEP_NAMES.SPEC_REVIEW, on: "needs-fix", to: STEP_NAMES.SPEC_FIXER },
  // spec-review escalation removed (R3 cutover): judge halt via loop exhaustion only
  { step: STEP_NAMES.TEST_CASE_GEN, on: "success", to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.TEST_CASE_GEN, on: "error",   to: "escalate" },
  // spec-fixer → spec-review (direct)
  { step: STEP_NAMES.SPEC_FIXER,  on: "approved",  to: STEP_NAMES.SPEC_REVIEW },
  { step: STEP_NAMES.SPEC_FIXER,  on: "error",     to: "escalate" },
  { step: STEP_NAMES.IMPLEMENTER, on: "success",   to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.IMPLEMENTER, on: "error",     to: "escalate" },
  { step: STEP_NAMES.VERIFICATION, on: "passed",   to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.VERIFICATION, on: "failed",   to: STEP_NAMES.BUILD_FIXER },
  { step: STEP_NAMES.VERIFICATION, on: "escalation", to: "escalate" },
  { step: STEP_NAMES.BUILD_FIXER, on: "success",   to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BUILD_FIXER, on: "error",     to: "escalate" },
  // --- code review loop ---
  // code-review approved + fixableCount > 0 → code-fixer (typed routing)
  { step: STEP_NAMES.CODE_REVIEW, on: "approved",  to: STEP_NAMES.CODE_FIXER,
    when: (s) => {
      const reviews = s.steps?.["code-review"];
      if (!reviews || reviews.length === 0) return false;
      const lastReview = reviews[reviews.length - 1];
      if (!lastReview) return false;
      return ((lastReview.outcome?.toolResult as CodeReviewReportResult | null | undefined)?.fixableCount ?? 0) > 0;
    },
  },
  // code-review approved (no fixable findings) → conformance
  { step: STEP_NAMES.CODE_REVIEW, on: "approved",  to: STEP_NAMES.CONFORMANCE },
  { step: STEP_NAMES.CODE_REVIEW, on: "needs-fix", to: STEP_NAMES.CODE_FIXER },
  // code-review escalation removed (R3 cutover): judge halt via loop exhaustion only
  // code-fixer → conformance (when: 直前 code-review が approved = observation fix 完了)
  { step: STEP_NAMES.CODE_FIXER,  on: "approved",  to: STEP_NAMES.CONFORMANCE,
    when: (s) => {
      const reviews = s.steps?.["code-review"];
      if (!reviews || reviews.length === 0) return false;
      const lastReview = reviews[reviews.length - 1];
      return lastReview?.outcome?.verdict === "approved";
    },
  },
  // code-fixer → code-review (needs-fix 由来 — fallback, when なし)
  { step: STEP_NAMES.CODE_FIXER,  on: "approved",  to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.CODE_FIXER,  on: "error",     to: "escalate" },
  // --- conformance (acceptance gate, after code-review approved) ---
  { step: STEP_NAMES.CONFORMANCE, on: "approved",  to: STEP_NAMES.ADR_GEN },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix", to: STEP_NAMES.IMPLEMENTER },
  // --- adr-gen (single shot, after conformance approved) ---
  { step: STEP_NAMES.ADR_GEN,     on: "success",   to: STEP_NAMES.PR_CREATE },
  { step: STEP_NAMES.ADR_GEN,     on: "error",     to: "escalate" },
  // --- pr-create (single shot, no loop) ---
  { step: STEP_NAMES.PR_CREATE,   on: "success",   to: "end" },
  { step: STEP_NAMES.PR_CREATE,   on: "error",     to: "escalate" },
];
