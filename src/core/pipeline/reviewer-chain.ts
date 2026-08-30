/**
 * Pure functions for the reviewer chain: the ordered sequence of review steps
 * in the impl phase (code-review followed by any custom reviewers).
 *
 * These functions are used by:
 * - composeReviewerDescriptor: build pipeline transitions for the chain
 * - code-fixer: resolve the active reviewer (where to read findings from)
 * - pipeline.ts: multi-reviewer fixer reverse lookup
 *
 * All functions are pure (no side effects, no I/O).
 */
import type { JobState } from "../../state/schema.js";
import type { Transition } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";
import type { CodeReviewReportResult } from "../port/report-result.js";
import type { Finding } from "../../kernel/report-result.js";
import { collectFixableFindings } from "../step/judge-verdict.js";
import { filterUndecidedFindings } from "../decision/decision-ledger.js";
import {
  REGRESSION_GATE_STEP_NAME,
  resolveActiveReviewer,
  nextAfterReviewer,
  getLatestJudgeFindings,
  conformanceFixInProgress,
  regressionGateActive,
  codeReviewLoopActive,
} from "../review-routing.js";

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------
export {
  deriveImplReviewerChain,
  deriveImplFixerChain,
  resolveActiveReviewer,
  nextAfterReviewer,
  conformanceFixInProgress,
  regressionGateActive,
  codeReviewLoopActive,
} from "../review-routing.js";

/**
 * Get the last verdict for a reviewer step from job state.
 */
function lastVerdictOf(state: JobState, reviewer: string): string | null {
  const runs = state.steps?.[reviewer] ?? [];
  if (runs.length === 0) return null;
  return runs[runs.length - 1]?.outcome?.verdict ?? null;
}

/**
 * Get the last findings for a reviewer step from job state.
 * Delegates to getLatestJudgeFindings; returns [] when null.
 */
function lastFindingsOf(state: JobState, reviewer: string): Finding[] {
  return getLatestJudgeFindings(state, reviewer) ?? [];
}

/**
 * Return the number of fixable findings from the last run of a reviewer step.
 *
 * Pure function: no I/O or side effects.
 *
 * @param state    - Current job state.
 * @param reviewer - Step name of the reviewer (e.g. "code-review", "regression-gate").
 * @returns Number of findings with resolution === "fixable" in the last run's toolResult.
 *          Returns 0 when the reviewer has no runs or the last run has no toolResult.
 */
export function lastReviewerFixableCount(state: JobState, reviewer: string): number {
  return collectFixableFindings(lastFindingsOf(state, reviewer)).length;
}

/**
 * Build the transition table rows for the reviewer chain.
 *
 * For each reviewer R_i in chain:
 *   R_i → approved + fixable findings → code-fixer  (findingsRouting)
 *   R_i → approved → next(R_i)                      (clean pass-through)
 *   R_i → needs-fix → code-fixer
 *
 * code-fixer rows (per reviewer, in priority order):
 *   1. code-fixer → next(R_i)  when active_reviewer == R_i AND R_i last verdict approved
 *   2. code-fixer → R_i        when active_reviewer == R_i  (fallback: return to active)
 *
 * code-fixer → error → escalate (single unconditional row)
 *
 * The returned transitions replace the hardcoded "code-review" literal rows in
 * STANDARD_TRANSITIONS. For chain=["code-review"], the output is functionally
 * identical to the original STANDARD_TRANSITIONS code-review/code-fixer section.
 *
 * @param chain - Reviewer chain (e.g. ["code-review"] or ["code-review", "security"]).
 */
export function buildReviewerChainTransitions(chain: string[]): Transition[] {
  const transitions: Transition[] = [];

  // --- Reviewer → fixer / next transitions ---
  for (const reviewer of chain) {
    const next = nextAfterReviewer(reviewer, chain);

    // approved + fixable findings → code-fixer (findings-derived routing)
    // Exclude disposition-decided findings before checking; a reviewer whose only
    // fixable findings are wontfix'd should not trigger the code-fixer.
    transitions.push({
      step: reviewer,
      on: "approved",
      to: STEP_NAMES.CODE_FIXER,
      when: (s) => {
        const runs = s.steps?.[reviewer];
        if (!runs || runs.length === 0) return false;
        const lastRun = runs[runs.length - 1];
        if (!lastRun) return false;
        const findings = lastFindingsOf(s, reviewer);
        const fixable = collectFixableFindings(findings);
        const active = filterUndecidedFindings(reviewer, fixable, s.decisions);
        return active.length > 0;
      },
    });

    // approved (no fixable findings) → next reviewer / conformance
    transitions.push({
      step: reviewer,
      on: "approved",
      to: next,
    });

    // needs-fix → code-fixer
    transitions.push({
      step: reviewer,
      on: "needs-fix",
      to: STEP_NAMES.CODE_FIXER,
    });

    // skipped → next reviewer / conformance (skip ≠ approved, bypass code-fixer)
    transitions.push({
      step: reviewer,
      on: "skipped",
      to: next,
    });
  }

  // --- code-fixer → reviewer/next transitions (per reviewer, priority order) ---
  // For each reviewer R_i: if active reviewer is R_i AND R_i last verdict approved
  //   → go to next(R_i)
  for (const reviewer of chain) {
    const next = nextAfterReviewer(reviewer, chain);
    transitions.push({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: next,
      when: (s) => {
        const active = resolveActiveReviewer(s, chain);
        return active === reviewer && lastVerdictOf(s, reviewer) === "approved";
      },
    });
  }

  // Fallback: code-fixer → active reviewer (needs-fix path or any unmatched approved)
  // Generate per-reviewer fallback rows so `to` can be statically declared.
  for (const reviewer of chain) {
    transitions.push({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: reviewer,
      when: (s) => resolveActiveReviewer(s, chain) === reviewer,
    });
  }

  // code-fixer error always escalates
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "error",
    to: "escalate",
  });

  return transitions;
}

// ---------------------------------------------------------------------------
// buildParallelReviewerTransitions (D7)
// ---------------------------------------------------------------------------

/**
 * Build the transition table rows for the parallel reviewer architecture.
 *
 * Design D7 (reviewer-parallel-execution): replaces buildReviewerChainTransitions
 * in the composed-reviewer path. Generates coordinator-centric rows WITHOUT any
 * member-level rows (members are driven by the engine's fan-out, not the table).
 *
 * Generated rows:
 *
 * code-review section (same as standard — clean approved goes to coordinator):
 *   code-review approved (fixable) → code-fixer
 *   code-review approved (clean)   → coordinator
 *   code-review needs-fix          → code-fixer
 *   code-review skipped            → coordinator
 *
 * coordinator section:
 *   coordinator approved  → regression-gate
 *   coordinator needs-fix → code-fixer
 *   coordinator skipped   → regression-gate
 *
 * regression-gate section:
 *   regression-gate approved (clean)   → conformance
 *   regression-gate needs-fix          → code-fixer
 *   regression-gate skipped            → conformance
 *
 * Note: "regression-gate approved (fixable) → code-fixer" is structurally unreachable after D2.
 * deriveRegressionGateVerdict returns needs-fix whenever fixable findings exist, so approved
 * only occurs when there are no fixable findings. That row has been removed.
 *
 * code-fixer routing (priority-ordered `when` guards):
 *   code-fixer approved → conformance          when conformanceFixInProgress
 *   code-fixer approved → regression-gate      when regressionGateActive
 *   code-fixer approved → code-review          when codeReviewLoopActive(coordinator)
 *   code-fixer approved → coordinator          (default)
 *   code-fixer error    → escalate
 *
 * @param opts.coordinator - Coordinator step name (e.g. "custom-reviewers").
 * @param opts.members     - Member reviewer step names (used only for reference; no rows generated).
 */
export function buildParallelReviewerTransitions(opts: {
  coordinator: string;
  members: readonly string[];
}): Transition[] {
  const { coordinator } = opts;
  const transitions: Transition[] = [];

  // --- code-review rows (same pattern as buildReviewerChainTransitions for the first reviewer) ---
  // approved + fixable findings → code-fixer (findings-routing)
  // Exclude disposition-decided findings before checking (mirrors buildReviewerChainTransitions guard).
  transitions.push({
    step: STEP_NAMES.CODE_REVIEW,
    on: "approved",
    to: STEP_NAMES.CODE_FIXER,
    when: (s) => {
      const runs = s.steps?.[STEP_NAMES.CODE_REVIEW];
      if (!runs || runs.length === 0) return false;
      const lastRun = runs[runs.length - 1];
      if (!lastRun) return false;
      const toolResult = lastRun.outcome.toolResult as CodeReviewReportResult | null | undefined;
      const findings = toolResult?.findings ?? [];
      const fixable = collectFixableFindings(findings);
      const active = filterUndecidedFindings(STEP_NAMES.CODE_REVIEW, fixable, s.decisions);
      return active.length > 0;
    },
  });
  // approved (no fixable findings) → coordinator
  transitions.push({
    step: STEP_NAMES.CODE_REVIEW,
    on: "approved",
    to: coordinator,
  });
  // needs-fix → code-fixer
  transitions.push({
    step: STEP_NAMES.CODE_REVIEW,
    on: "needs-fix",
    to: STEP_NAMES.CODE_FIXER,
  });
  // skipped → coordinator
  transitions.push({
    step: STEP_NAMES.CODE_REVIEW,
    on: "skipped",
    to: coordinator,
  });

  // --- coordinator rows ---
  // approved → regression-gate
  transitions.push({
    step: coordinator,
    on: "approved",
    to: REGRESSION_GATE_STEP_NAME,
  });
  // needs-fix → code-fixer
  transitions.push({
    step: coordinator,
    on: "needs-fix",
    to: STEP_NAMES.CODE_FIXER,
  });
  // skipped → regression-gate (skipped coordinator = structural pass-through)
  transitions.push({
    step: coordinator,
    on: "skipped",
    to: REGRESSION_GATE_STEP_NAME,
  });
  // NOTE (round-all-skip-pass-through): the former "all-members-skipped escalation →
  // regression-gate" conditional transition has been removed. All-skip now returns "approved"
  // from aggregateVerdict, so the "coordinator approved → regression-gate" row above handles
  // the all-skip path. Other coordinator escalation causes (e.g. ROUND_NONDECLARED_CHANGE)
  // still default to the "escalate" terminal and stop the pipeline immediately.

  // --- regression-gate rows ---
  // approved (clean) → conformance
  transitions.push({
    step: REGRESSION_GATE_STEP_NAME,
    on: "approved",
    to: STEP_NAMES.CONFORMANCE,
  });
  // needs-fix → code-fixer
  transitions.push({
    step: REGRESSION_GATE_STEP_NAME,
    on: "needs-fix",
    to: STEP_NAMES.CODE_FIXER,
  });
  // skipped → conformance
  transitions.push({
    step: REGRESSION_GATE_STEP_NAME,
    on: "skipped",
    to: STEP_NAMES.CONFORMANCE,
  });

  // --- code-fixer routing (priority-ordered when guards) ---
  // Priority 1: conformance fix in progress → back to conformance
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "approved",
    to: STEP_NAMES.CONFORMANCE,
    when: (s) => conformanceFixInProgress(s),
  });
  // Priority 2: regression-gate triggered this fixer → back to regression-gate
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "approved",
    to: REGRESSION_GATE_STEP_NAME,
    when: (s) => !conformanceFixInProgress(s) && regressionGateActive(s),
  });
  // Priority 3: code-review loop still active (coordinator not started) → back to code-review
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "approved",
    to: STEP_NAMES.CODE_REVIEW,
    when: (s) => !conformanceFixInProgress(s) && !regressionGateActive(s) && codeReviewLoopActive(s, coordinator),
  });
  // Default (priority 4): return to coordinator (custom reviewer re-review)
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "approved",
    to: coordinator,
  });
  // error → escalate
  transitions.push({
    step: STEP_NAMES.CODE_FIXER,
    on: "error",
    to: "escalate",
  });

  return transitions;
}
