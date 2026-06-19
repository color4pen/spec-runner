/**
 * Pure functions for per-reviewer status management.
 *
 * Design D1 / D5 / D6 / D8 (reviewer-parallel-execution):
 *
 * - All functions are pure (no I/O, no LLM calls).
 * - Git diff acquisition is the engine's responsibility; touched files are passed as arguments.
 * - Used by the coordinator fan-out in pipeline.ts.
 *
 * Exported types:
 *   ReviewerStatus — imported from kernel (state → kernel direction preserved)
 *
 * Functions:
 *   deriveReviewerStatuses    — initialize or return existing per-reviewer status records
 *   selectPendingMembers      — filter approved/skipped members for resume skip (D8)
 *   applyRoundResults         — update statuses from a parallel round's verdicts
 *   aggregateVerdict          — escalation > needs-fix > approved priority rule (D5)
 *   computeInvalidations      — fixer touched files × activationPaths invalidation (D6)
 */

import type { JobState } from "../../state/schema.js";
import type { ReviewerStatus } from "../../kernel/reviewer-snapshot.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import { evaluateActivation } from "../reviewers/activation.js";

export type { ReviewerStatus };

// ---------------------------------------------------------------------------
// deriveReviewerStatuses
// ---------------------------------------------------------------------------

/**
 * Derive per-reviewer status records from job state.
 *
 * - When `state.reviewerStatuses` is present, returns it unchanged (idempotent).
 * - When absent, initializes all members to `pending` with activationPaths copied
 *   from each snapshot's `paths` field.
 *
 * Design D8: resume skip is achieved by reading this record at coordinator entry;
 * no separate resume branch is needed.
 *
 * @param state   - Current job state.
 * @param members - Reviewer snapshots declared for this job.
 */
export function deriveReviewerStatuses(
  state: JobState,
  members: ReviewerSnapshot[],
): ReviewerStatus[] {
  if (state.reviewerStatuses && state.reviewerStatuses.length > 0) {
    return state.reviewerStatuses;
  }
  // Initialize all members as pending with activationPaths from snapshot
  return members.map((m) => ({
    name: m.name,
    status: "pending" as const,
    approvedAtCommit: null,
    activationPaths: m.paths,
    invalidatedByCommit: null,
  }));
}

// ---------------------------------------------------------------------------
// selectPendingMembers
// ---------------------------------------------------------------------------

/**
 * Return the names of reviewers with status === "pending" in declaration order.
 *
 * approved and skipped reviewers are excluded:
 * - approved → skip on resume (D8), or have passed the current round
 * - skipped → activation not matched; skipped is fixed for the job lifetime
 *
 * @param statuses - Current reviewer status records.
 * @param members  - Reviewer names in declaration order.
 */
export function selectPendingMembers(
  statuses: ReviewerStatus[],
  members: string[],
): string[] {
  const statusByName = new Map(statuses.map((s) => [s.name, s.status]));
  return members.filter((name) => {
    const status = statusByName.get(name);
    // Unknown members (not in statuses yet) are treated as pending
    return status === "pending" || status === undefined;
  });
}

// ---------------------------------------------------------------------------
// applyRoundResults
// ---------------------------------------------------------------------------

/**
 * Update reviewer statuses based on the verdicts produced in a parallel round.
 *
 * Rules:
 * - approved → status = "approved", approvedAtCommit = headSha
 * - needs-fix → status = "pending" (clear approvedAtCommit)
 * - skipped   → status = "skipped"
 * - Any other verdict (escalation, error) → leave status as pending
 *
 * @param statuses - Existing status records.
 * @param results  - Map of reviewer name → latest verdict string.
 * @param headSha  - HEAD SHA at round completion time.
 */
export function applyRoundResults(
  statuses: ReviewerStatus[],
  results: Map<string, string>,
  headSha: string,
): ReviewerStatus[] {
  return statuses.map((s) => {
    const verdict = results.get(s.name);
    if (verdict === undefined) return s;

    if (verdict === "approved") {
      return {
        ...s,
        status: "approved" as const,
        approvedAtCommit: headSha,
        invalidatedByCommit: null,
      };
    }
    if (verdict === "skipped") {
      return { ...s, status: "skipped" as const };
    }
    if (verdict === "needs-fix") {
      return {
        ...s,
        status: "pending" as const,
        approvedAtCommit: null,
      };
    }
    // escalation / error / unknown → leave pending (safe default)
    return { ...s, status: "pending" as const };
  });
}

// ---------------------------------------------------------------------------
// aggregateVerdict
// ---------------------------------------------------------------------------

/**
 * Aggregate individual member verdicts into a single coordinator verdict.
 *
 * Priority: escalation > needs-fix > approved
 * - Any escalation → "escalation"
 * - No escalation, any needs-fix → "needs-fix"
 * - All approved or skipped → "approved" (skipped counts as approved for gate)
 *
 * Design D5: skipped is treated as approved for the purpose of gate progression
 * (activation not matched → reviewer has no opinion → pass-through).
 *
 * @param memberVerdicts - Array of verdict strings from each member's last run.
 */
export function aggregateVerdict(
  memberVerdicts: string[],
): "approved" | "needs-fix" | "escalation" {
  let hasNeedsFix = false;
  for (const v of memberVerdicts) {
    if (v === "escalation") return "escalation";
    if (v === "needs-fix") hasNeedsFix = true;
  }
  return hasNeedsFix ? "needs-fix" : "approved";
}

// ---------------------------------------------------------------------------
// computeInvalidations
// ---------------------------------------------------------------------------

/**
 * Revert approved reviewers to pending when the fixer touched their activation paths.
 *
 * For each approved reviewer:
 * - Calls `evaluateActivation({ paths: activationPaths }, { changedFiles: touchedFiles, requestType })`.
 * - activated: true  → set status = "pending", invalidatedByCommit = headSha
 * - activated: false → leave approved
 *
 * Design D6: git diff acquisition is the engine's responsibility.
 * This function receives the already-computed `touchedFiles` list as a pure argument.
 * No I/O is performed here.
 *
 * Managed runtime (touchedFiles = []) → no invalidation fires for path-constrained reviewers
 * (evaluateActivation requires at least one touched file to match activationPaths).
 * Exception: always-activate reviewers (activationPaths: undefined) are always invalidated
 * regardless of touchedFiles — evaluateActivation ignores changedFiles when paths is undefined.
 * NOTE: local implementation uses approvedAtCommit-based listChangedFiles in the engine.
 *
 * paths undefined reviewer (always-activate) → evaluateActivation returns activated: true
 * unconditionally → always reverts to pending after any fixer run, even with touchedFiles = [].
 *
 * @param statuses     - Current reviewer status records.
 * @param touchedFiles - Files changed by the fixer (from git diff, passed by engine).
 * @param requestType  - Job request type (used by evaluateActivation requestTypes check).
 * @param headSha      - HEAD SHA at invalidation time (set as invalidatedByCommit).
 */
export function computeInvalidations(
  statuses: ReviewerStatus[],
  touchedFiles: string[],
  requestType: string,
  headSha: string,
): ReviewerStatus[] {
  return statuses.map((s) => {
    if (s.status !== "approved") return s;

    // Evaluate whether the fixer's touched files activate this reviewer's scope
    const activation = evaluateActivation(
      { paths: s.activationPaths },
      { changedFiles: touchedFiles, requestType },
    );

    if (activation.activated) {
      // Fixer touched this reviewer's activation paths → invalidate
      return {
        ...s,
        status: "pending" as const,
        approvedAtCommit: null,
        invalidatedByCommit: headSha,
      };
    }

    return s;
  });
}
