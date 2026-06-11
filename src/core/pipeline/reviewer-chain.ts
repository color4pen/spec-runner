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
import type { ReviewerSnapshot } from "../reviewers/types.js";
import type { CodeReviewReportResult } from "../port/report-result.js";
import { collectFixableFindings } from "../step/judge-verdict.js";

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
