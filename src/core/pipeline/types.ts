import type { Verdict, JobState } from "../../state/schema.js";
import { STEP_NAMES } from "../step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";
import type { Step } from "../step/types.js";
import { buildReviewerChainTransitions } from "./reviewer-chain.js";
import { reverificationNeeded, conformanceApprovedForVerifiedRevision } from "./reverification.js";

/**
 * Pipeline-level role of a step (convergence / resume semantics).
 * creator         — generates the phase artifact; one per phase.
 * reviewer        — verdict-driven loop step; one per phase; retry exhaustion re-routes to paired fixer.
 * custom-reviewer — project-defined reviewer injected after code-review; shares code-fixer.
 * fixer           — repairs findings from a reviewer or gate; may have multiple per phase.
 * gate            — deterministic check or linear-progress step (verification, pr-create, etc.).
 */
export type StepRole = "creator" | "reviewer" | "custom-reviewer" | "fixer" | "gate";

/** Pipeline phase a step belongs to. */
export type StepPhase = "spec" | "impl";

/** Role and phase declared per step in a PipelineDescriptor. */
export interface StepRoleEntry {
  role: StepRole;
  phase: StepPhase;
}

/**
 * A single forbidden surface declared in a PermissionScope.
 * The CLI matches base...HEAD changed files against `paths` globs to detect breaches.
 */
export interface ForbiddenSurface {
  /** Stable identifier for this surface, used in escalation rationale. */
  id: string;
  /** Glob patterns matched against base...HEAD changed-file paths. */
  paths: readonly string[];
}

/**
 * Permission scope declaration for a pipeline profile.
 *
 * When present on a PipelineDescriptor, the CLI evaluates changed files against
 * forbidden surfaces at the `checkpoint` judge step and synthesizes a scope-breach
 * decision-needed finding when a surface is violated.
 *
 * absent = 無制限 = 現行挙動 (no scope checking performed)
 * checkpoint は finding から verdict を導出する judge 系 step であること
 * path 粒度。content 粒度は将来拡張
 */
export interface PermissionScope {
  /** Step name where scope is evaluated (must be a judge step). */
  checkpoint: string;
  /** Machine-axis forbidden surfaces enumerated as glob-matched path sets. */
  forbidden: readonly ForbiddenSurface[];
}

/**
 * Parallel review configuration declared on PipelineDescriptor.
 *
 * Design D2 (reviewer-parallel-execution): when custom reviewers are present,
 * composeReviewerDescriptor synthesizes a virtual coordinator node that the
 * engine fan-outs to member steps in parallel.
 *
 * The coordinator step is NOT in the steps Map; the engine detects it here.
 */
export interface ParallelReviewConfig {
  /** Virtual coordinator step name (e.g. "custom-reviewers"). */
  coordinator: string;
  /** Member reviewer step names in declaration order. */
  members: readonly string[];
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
  /**
   * Per-step maxIterations overrides.
   * When set for a step name, Pipeline uses this value instead of the global maxIterations
   * for exhaustion checks on that step. Used for custom reviewers which may have
   * different convergence budgets than the pipeline default.
   * Keys are step names; absent = use global maxIterations.
   */
  maxIterationsByStep?: Readonly<Record<string, number>>;
  /**
   * Optional permission scope declaration for this pipeline profile.
   *
   * absent = 無制限 = 現行挙動 (no scope checking performed — existing behavior preserved)
   * When present, the CLI evaluates changed files against `forbidden` surfaces at the
   * `checkpoint` judge step and synthesizes a scope-breach decision-needed finding.
   * checkpoint は finding から verdict を導出する judge 系 step であること
   * Path granularity only; content granularity is future extension.
   */
  permissionScope?: PermissionScope;
  /**
   * Parallel review configuration for custom reviewer fan-out.
   *
   * Design D2 (reviewer-parallel-execution): set by composeReviewerDescriptor when
   * custom reviewers are present. Absent for zero-reviewer (standard/fast) pipelines.
   * Consumed by Pipeline.runInternal to detect the coordinator node and fan-out members.
   *
   * absent = standard sequential execution (zero-reviewer backward compat preserved)
   */
  parallelReview?: ParallelReviewConfig;
}

/**
 * A single row in the transition table.
 * Defines: when step `step` produces verdict `on`, go to `to`.
 *
 * `when` is an optional context predicate. When defined, the transition only
 * fires if `when(state)` returns true. This enables context-aware routing
 * (e.g. code-review approved with fixable findings ≥ 1 → code-fixer).
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
  [REGRESSION_GATE_STEP_NAME]: {
    code: "REGRESSION_GATE_RETRIES_EXHAUSTED",
    message: (n) => `regression-gate did not approve after ${n} iterations`,
    hint: (nnn) => `Review regression-gate-result-${nnn}.md and fix the regressions manually.`,
  },
  // Design D4 (reviewer-parallel-execution): coordinator exhaustion.
  // CUSTOM_REVIEWERS_STEP_NAME cannot be referenced directly here (circular import risk),
  // so we use the string literal. The constant is exported for external use.
  "custom-reviewers": {
    code: "CUSTOM_REVIEWERS_RETRIES_EXHAUSTED",
    message: (n) => `custom reviewers did not approve after ${n} iterations`,
    hint: (nnn) => `Review the latest reviewer results and address findings manually. (iteration ${nnn})`,
  },
};

/**
 * Virtual coordinator step name used for the custom reviewer parallel fan-out.
 *
 * Design D2 (reviewer-parallel-execution): the coordinator is NOT in the pipeline
 * steps Map; it exists only as an entry in parallelReview and loopNames.
 * The engine detects it at runtime to fan-out member execution.
 */
export const CUSTOM_REVIEWERS_STEP_NAME = "custom-reviewers" as const;

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
  { step: STEP_NAMES.TEST_CASE_GEN,    on: "success", to: STEP_NAMES.TEST_MATERIALIZE },
  { step: STEP_NAMES.TEST_CASE_GEN,    on: "error",   to: "escalate" },
  { step: STEP_NAMES.TEST_MATERIALIZE, on: "success", to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.TEST_MATERIALIZE, on: "error",   to: "escalate" },
  // spec-fixer → spec-review (direct)
  { step: STEP_NAMES.SPEC_FIXER,  on: "approved",  to: STEP_NAMES.SPEC_REVIEW },
  { step: STEP_NAMES.SPEC_FIXER,  on: "error",     to: "escalate" },
  { step: STEP_NAMES.IMPLEMENTER, on: "success",   to: STEP_NAMES.BITE_EVIDENCE },
  { step: STEP_NAMES.IMPLEMENTER, on: "error",     to: "escalate" },
  // --- bite-evidence gate (R4, forward strategy) ---
  { step: STEP_NAMES.BITE_EVIDENCE, on: "passed",            to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BITE_EVIDENCE, on: "strategy-deferred", to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BITE_EVIDENCE, on: "failed",            to: "escalate" },
  { step: STEP_NAMES.BITE_EVIDENCE, on: "error",             to: "escalate" },
  { step: STEP_NAMES.VERIFICATION, on: "passed",   to: STEP_NAMES.ADR_GEN,    when: conformanceApprovedForVerifiedRevision },
  { step: STEP_NAMES.VERIFICATION, on: "passed",   to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.VERIFICATION, on: "failed",   to: STEP_NAMES.BUILD_FIXER },
  { step: STEP_NAMES.VERIFICATION, on: "escalation", to: "escalate" },
  { step: STEP_NAMES.BUILD_FIXER, on: "success",   to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BUILD_FIXER, on: "error",     to: "escalate" },
  // --- code review loop (generalized via buildReviewerChainTransitions) ---
  // For the standard pipeline (no custom reviewers), chain = ["code-review"].
  // The generated transitions are functionally identical to the previous hardcoded rows.
  // When custom reviewers are present, composeReviewerDescriptor regenerates transitions
  // with the full chain; STANDARD_TRANSITIONS is only used for the base (no-reviewer) case.
  // code-review escalation removed (R3 cutover): judge halt via loop exhaustion only
  ...buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]),
  // --- conformance (acceptance gate, after code-review approved) ---
  { step: STEP_NAMES.CONFORMANCE, on: "approved", to: STEP_NAMES.VERIFICATION, when: reverificationNeeded },
  { step: STEP_NAMES.CONFORMANCE, on: "approved",             to: STEP_NAMES.ADR_GEN },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix:spec-fixer", to: STEP_NAMES.SPEC_FIXER },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix:implementer", to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix:code-fixer", to: STEP_NAMES.CODE_FIXER },
  // Backward-compat: plain "needs-fix" (legacy history / pre-fixTarget jobs) → implementer
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix", to: STEP_NAMES.IMPLEMENTER },
  // --- adr-gen (single shot, after conformance approved) ---
  { step: STEP_NAMES.ADR_GEN,     on: "success",   to: STEP_NAMES.PR_CREATE },
  // reduce-added-agent-turns T-03: adr:false triggers skipWhen → skipped verdict → pr-create
  { step: STEP_NAMES.ADR_GEN,     on: "skipped",   to: STEP_NAMES.PR_CREATE },
  { step: STEP_NAMES.ADR_GEN,     on: "error",     to: "escalate" },
  // --- pr-create (single shot, no loop) ---
  { step: STEP_NAMES.PR_CREATE,   on: "success",   to: "end" },
  { step: STEP_NAMES.PR_CREATE,   on: "error",     to: "escalate" },
];

/**
 * Fast pipeline transition table.
 *
 * Derived from STANDARD_TRANSITIONS with spec-review / spec-fixer / test-case-gen / adr-gen
 * rows removed. design goes directly to implementer (no spec-review gate).
 * conformance approved goes directly to pr-create (no adr-gen step).
 * reverification chokepoints (conformanceApprovedLatest / reverificationNeeded)
 * are preserved with the same when-guard ordering as standard.
 *
 * needs-fix:spec-fixer is intentionally absent → no matching transition → escalate fallback
 * (pipeline.ts:298 `?? "escalate"`). This is correct: spec/design-level fixes are outside
 * the fast profile's slim design contract, and escalation is the honest outcome.
 */
export const FAST_TRANSITIONS: Transition[] = [
  // --- request-review gate (first step) ---
  { step: STEP_NAMES.REQUEST_REVIEW, on: "approve",          to: STEP_NAMES.DESIGN },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "needs-discussion", to: "escalate" },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "reject",           to: "escalate" },
  { step: STEP_NAMES.REQUEST_REVIEW, on: "error",            to: "escalate" },
  // --- design → implementer (spec-review / test-case-gen bypassed) ---
  { step: STEP_NAMES.DESIGN,       on: "success", to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.DESIGN,       on: "error",   to: "escalate" },
  // --- implementer → verification ---
  { step: STEP_NAMES.IMPLEMENTER,  on: "success", to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.IMPLEMENTER,  on: "error",   to: "escalate" },
  // --- verification loop (reverification chokepoint: when-guarded rows first) ---
  { step: STEP_NAMES.VERIFICATION, on: "passed",    to: STEP_NAMES.PR_CREATE,    when: conformanceApprovedForVerifiedRevision },
  { step: STEP_NAMES.VERIFICATION, on: "passed",    to: STEP_NAMES.CODE_REVIEW },
  { step: STEP_NAMES.VERIFICATION, on: "failed",    to: STEP_NAMES.BUILD_FIXER },
  { step: STEP_NAMES.VERIFICATION, on: "escalation", to: "escalate" },
  { step: STEP_NAMES.BUILD_FIXER,  on: "success",   to: STEP_NAMES.VERIFICATION },
  { step: STEP_NAMES.BUILD_FIXER,  on: "error",     to: "escalate" },
  // --- code-review loop (same generator as standard, chain=["code-review"]) ---
  ...buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]),
  // --- conformance (acceptance gate + scope checkpoint; adr-gen absent) ---
  { step: STEP_NAMES.CONFORMANCE, on: "approved",              to: STEP_NAMES.VERIFICATION, when: reverificationNeeded },
  { step: STEP_NAMES.CONFORMANCE, on: "approved",              to: STEP_NAMES.PR_CREATE },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix:implementer", to: STEP_NAMES.IMPLEMENTER },
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix:code-fixer",  to: STEP_NAMES.CODE_FIXER },
  // Backward-compat: plain "needs-fix" → implementer (catch-all; no spec-fixer row — escalates)
  { step: STEP_NAMES.CONFORMANCE, on: "needs-fix",             to: STEP_NAMES.IMPLEMENTER },
  // --- pr-create (terminal) ---
  { step: STEP_NAMES.PR_CREATE,   on: "success",               to: "end" },
  { step: STEP_NAMES.PR_CREATE,   on: "error",                 to: "escalate" },
];
