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
import { CUSTOM_REVIEWERS_STEP_NAME } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import type { CodeReviewReportResult } from "../port/report-result.js";
import { collectFixableFindings } from "../step/judge-verdict.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";
import { getConformanceFixContext } from "../step/fixer-helpers.js";

/**
 * Derive the full reviewer chain for the impl phase from job state.
 * Returns ["code-review", ...customReviewerNames] in declaration order.
 *
 * @param stateOrSnapshots - Either a JobState (uses state.reviewers) or a ReviewerSnapshot[].
 */
export function deriveImplReviewerChain(
  stateOrSnapshots: JobState | ReviewerSnapshot[],
): string[] {
  const snapshots = Array.isArray(stateOrSnapshots)
    ? stateOrSnapshots
    : (stateOrSnapshots as JobState).reviewers ?? [];
  return [STEP_NAMES.CODE_REVIEW, ...snapshots.map((s) => s.name)];
}

/**
 * Derive the full fixer chain for code-fixer (reviewer chain + regression-gate when applicable).
 *
 * Returns ["code-review"] when no custom reviewers are present (zero-reviewer case).
 * Returns ["code-review", ...customNames, "regression-gate"] when custom reviewers are present.
 *
 * code-fixer uses this chain to resolve the active reviewer (where to read findings from),
 * which includes the regression-gate when it is part of the pipeline.
 *
 * @param state - Current job state.
 */
export function deriveImplFixerChain(state: JobState): string[] {
  const chain = deriveImplReviewerChain(state);
  const hasReviewers = (state.reviewers?.length ?? 0) > 0;
  if (hasReviewers) {
    return [...chain, REGRESSION_GATE_STEP_NAME];
  }
  return chain;
}

/**
 * Resolve the currently active reviewer from job state.
 *
 * The active reviewer is the one with the most recent execution (latest startedAt).
 * Since reviewers run in declaration order and a reviewer can only run after all
 * preceding reviewers have approved, the "last to run" IS the active reviewer.
 *
 * Tie-breaking: when two reviewers share the same startedAt, the later one in the
 * chain wins (>= preserves the last write in declaration order).
 *
 * Fallback: if no reviewer in the chain has run, returns the first reviewer.
 *
 * @param state - Current job state.
 * @param chain - Reviewer chain from deriveImplReviewerChain.
 */
export function resolveActiveReviewer(state: JobState, chain: string[]): string {
  let latestTime = "";
  let activeReviewer = chain[0] ?? STEP_NAMES.CODE_REVIEW;

  for (const reviewer of chain) {
    const runs = state.steps?.[reviewer] ?? [];
    if (runs.length === 0) continue;
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.startedAt >= latestTime) {
      latestTime = lastRun.startedAt;
      activeReviewer = reviewer;
    }
  }

  return activeReviewer;
}

/**
 * Return the next step after the given reviewer in the chain.
 * Returns STEP_NAMES.CONFORMANCE if the reviewer is the last in the chain.
 *
 * @param reviewer - Current reviewer step name.
 * @param chain    - Full reviewer chain.
 */
export function nextAfterReviewer(reviewer: string, chain: string[]): string {
  const idx = chain.indexOf(reviewer);
  if (idx === -1 || idx === chain.length - 1) {
    return STEP_NAMES.CONFORMANCE;
  }
  return chain[idx + 1]!;
}

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
 */
function lastFindingsOf(state: JobState, reviewer: string): import("../../kernel/report-result.js").Finding[] {
  const runs = state.steps?.[reviewer] ?? [];
  if (runs.length === 0) return [];
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return [];
  const toolResult = lastRun.outcome.toolResult as CodeReviewReportResult | null | undefined;
  return toolResult?.findings ?? [];
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
        return collectFixableFindings(findings).length > 0;
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
// Predicates for composed-path code-fixer routing (D7)
// ---------------------------------------------------------------------------

/**
 * True when conformance has triggered this code-fixer entry.
 *
 * Design D7 (reviewer-parallel-execution): code-fixer in the composed path routes
 * back via priority-ordered predicates instead of resolveActiveReviewer.
 * Priority 1: conformance fix in progress → return to conformance.
 *
 * Delegates to getConformanceFixContext — same recency-based detection used in
 * buildMessage(). No new seam introduced.
 */
export function conformanceFixInProgress(state: JobState): boolean {
  return getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) !== null;
}

/**
 * True when the regression-gate is the active fixer source.
 *
 * Design D7 (reviewer-parallel-execution): priority 2 after conformance.
 * regression-gate triggered this fixer entry when:
 * - the regression-gate's latest verdict is "needs-fix", OR
 * - the regression-gate approved BUT had fixable findings (findings-routing path).
 */
export function regressionGateActive(state: JobState): boolean {
  const runs = state.steps?.[REGRESSION_GATE_STEP_NAME] ?? [];
  if (runs.length === 0) return false;
  const last = runs[runs.length - 1];
  if (!last) return false;
  const verdict = last.outcome.verdict;
  if (verdict === "needs-fix") return true;
  if (verdict === "approved") {
    // findings-routing: approved but had fixable findings
    const toolResult = last.outcome.toolResult as { findings?: import("../../kernel/report-result.js").Finding[] } | null | undefined;
    const findings = toolResult?.findings ?? [];
    return collectFixableFindings(findings).length > 0;
  }
  return false;
}

/**
 * True when code-review (the standard built-in reviewer) is still in its convergence loop.
 *
 * Design D7 (reviewer-parallel-execution): priority 3 after regression-gate.
 * code-review loop is active when:
 * - the coordinator (parallelReview) has NOT started yet (no runs on coordinator), AND
 * - code-review's latest verdict is "needs-fix" (i.e. the fixer was sent by code-review)
 *
 * @param state           - Current job state.
 * @param coordinatorName - Name of the coordinator step (e.g. "custom-reviewers").
 */
export function codeReviewLoopActive(state: JobState, coordinatorName: string): boolean {
  // If coordinator has run at least once, we are past the code-review loop
  const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
  if (coordinatorRuns.length > 0) return false;

  const codeReviewRuns = state.steps?.[STEP_NAMES.CODE_REVIEW] ?? [];
  if (codeReviewRuns.length === 0) return false;
  const lastCodeReview = codeReviewRuns[codeReviewRuns.length - 1];
  return lastCodeReview?.outcome.verdict === "needs-fix";
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
 *   regression-gate approved (fixable) → code-fixer
 *   regression-gate approved (clean)   → conformance
 *   regression-gate needs-fix          → code-fixer
 *   regression-gate skipped            → conformance
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
      return collectFixableFindings(findings).length > 0;
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
  // skipped → regression-gate (skipped coordinator = all members skipped = treat as approved)
  transitions.push({
    step: coordinator,
    on: "skipped",
    to: REGRESSION_GATE_STEP_NAME,
  });

  // --- regression-gate rows ---
  // approved + fixable findings → code-fixer
  transitions.push({
    step: REGRESSION_GATE_STEP_NAME,
    on: "approved",
    to: STEP_NAMES.CODE_FIXER,
    when: (s) => {
      const runs = s.steps?.[REGRESSION_GATE_STEP_NAME];
      if (!runs || runs.length === 0) return false;
      const lastRun = runs[runs.length - 1];
      if (!lastRun) return false;
      const toolResult = lastRun.outcome.toolResult as { findings?: import("../../kernel/report-result.js").Finding[] } | null | undefined;
      const findings = toolResult?.findings ?? [];
      return collectFixableFindings(findings).length > 0;
    },
  });
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
