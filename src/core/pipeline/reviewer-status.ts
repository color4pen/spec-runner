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
import { isBoundToCanonHash } from "../../kernel/reviewer-snapshot.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import type { StepExecutionResult } from "../step/commit-orchestrator.js";
import type { ArtifactRef } from "../../state/artifact-types.js";
import { evaluateActivation } from "../reviewers/activation.js";

export type { ReviewerStatus };

// ---------------------------------------------------------------------------
// computeCanonHash
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic content hash string from a list of ArtifactRefs.
 *
 * Algorithm (D3, custom-reviewer-canon-binding):
 *   1. Filter refs to those with non-null hash values.
 *   2. Sort filtered refs by path (ascending lexicographic) for determinism.
 *   3. Serialize as "path:hash|path:hash|..." joined string.
 *   4. Return null when no non-null hashes are present (all missing / managed runtime).
 *
 * The returned string is opaque and suitable for equality comparison only.
 * Different sets of canonical docs → different string. Same set in any order → same string.
 *
 * @param refs - ArtifactRef array (e.g. from runtimeStrategy.digestArtifacts).
 * @returns Deterministic hash string, or null if all refs have null hash.
 */
export function computeCanonHash(refs: ArtifactRef[]): string | null {
  const adopted = refs.filter((r) => r.hash !== null);
  if (adopted.length === 0) return null;
  adopted.sort((a, b) => a.path.localeCompare(b.path));
  return adopted.map((r) => `${r.path}:${r.hash}`).join("|");
}

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
 * T-04 (approval-revision-binding): When `baselineCommit` is a non-null string,
 * an approved member is only excluded (skip) if its `approvedAtCommit` matches
 * `baselineCommit` exactly. Mismatched or absent `approvedAtCommit` reverts the
 * member to pending (fail-closed per D6 / req 6).
 *
 * When `baselineCommit` is null or undefined (managed runtime / unknown baseline),
 * revision checking is disabled and the function falls back to status-only behaviour
 * (approved → exclude, regardless of commitOid). This preserves managed-runtime
 * fail-safe skip and backward compatibility with 2-arg call sites.
 *
 * T-04 (canon-hash binding, custom-reviewer-canon-binding): When `currentCanonHash` is
 * a string or null, canon verification is engaged after revision matching (local path only):
 *   - `currentCanonHash === undefined` → canon check disabled (3-arg backward compat, skip)
 *   - `currentCanonHash === null`      → canon unavailable → fail-closed → pending
 *   - `rec.canonHash` absent/null      → legacy record → fail-closed → pending
 *   - `rec.canonHash === currentCanonHash` → match → skip
 *   - else                             → mismatch → pending (canonical docs changed)
 *
 * Managed short-circuit (baselineCommit=null) fires BEFORE canon check. This ensures
 * that managed runtime (null baseline) always skips approved reviewers without canon check.
 *
 * Approval exclusion table:
 *   baselineCommit = null/undefined → revision check disabled → approved always excluded
 *   baselineCommit = "sha" + approvedAtCommit = "sha" + currentCanonHash = undefined → skip (3-arg compat)
 *   baselineCommit = "sha" + approvedAtCommit = "sha" + currentCanonHash = null → pending (fail-closed)
 *   baselineCommit = "sha" + approvedAtCommit = "sha" + rec.canonHash absent/null → pending (legacy)
 *   baselineCommit = "sha" + approvedAtCommit = "sha" + rec.canonHash === currentCanonHash → skip
 *   baselineCommit = "sha" + approvedAtCommit = "sha" + rec.canonHash ≠ currentCanonHash → pending
 *   baselineCommit = "sha" + approvedAtCommit = "other" → mismatch → pending (re-run)
 *   baselineCommit = "sha" + approvedAtCommit = null   → absent → pending (fail-closed)
 *
 * @param statuses          - Current reviewer status records.
 * @param members           - Reviewer names in declaration order.
 * @param baselineCommit    - Current HEAD SHA to check against approvedAtCommit.
 *                            null/undefined → disable revision check (managed fail-safe).
 * @param currentCanonHash  - Current canonical docs hash (from computeCanonHash).
 *                            undefined → disable canon check (backward compat / no digestArtifacts).
 *                            null → canon unavailable → fail-closed.
 *                            string → check against rec.canonHash.
 */
export function selectPendingMembers(
  statuses: ReviewerStatus[],
  members: string[],
  baselineCommit?: string | null,
  currentCanonHash?: string | null,
): string[] {
  const statusMap = new Map(statuses.map((s) => [s.name, s]));
  return members.filter((name) => {
    const rec = statusMap.get(name);
    // Unknown members (not in statuses yet) are treated as pending
    if (rec === undefined) return true;

    const status = rec.status;
    if (status === "skipped") return false;
    if (status !== "approved") return true; // pending or any other non-approved

    // Member is approved. Check revision binding when baseline is available.
    if (baselineCommit == null) {
      // null/undefined baseline → disable revision check → exclude (managed fail-safe).
      // Canon check is also skipped (managed short-circuit fires first, D4).
      return false;
    }

    // Revision check: approvedAtCommit must match baselineCommit exactly.
    // null/undefined approvedAtCommit → fail-closed → pending.
    const approvedAtCommit = rec.approvedAtCommit;
    if (!approvedAtCommit) return true; // null → pending (fail-closed)
    if (approvedAtCommit !== baselineCommit) return true; // mismatch → pending

    // Revision matches. Now apply canon hash binding if engaged (local path only).
    // currentCanonHash=undefined → 3-arg backward compat → skip canon check → exclude (skip)
    if (currentCanonHash === undefined) return false;

    // currentCanonHash=null → canon unavailable → fail-closed → pending
    if (currentCanonHash === null) return true;

    // Canon check: record must have a bound (non-null string) canonHash.
    // absent (undefined) or null → unbound legacy record → fail-closed → pending
    if (!isBoundToCanonHash(rec)) return true; // unbound → pending (fail-closed / legacy)

    // Both revision and canon match → skip (exclude from pending list)
    return rec.canonHash !== currentCanonHash; // true = pending if mismatch
  });
}

// ---------------------------------------------------------------------------
// applyRoundResults
// ---------------------------------------------------------------------------

/**
 * Update reviewer statuses based on the verdicts produced in a parallel round.
 *
 * Rules:
 * - approved → status = "approved", approvedAtCommit = headSha, canonHash = currentCanonHash ?? null
 * - needs-fix → status = "pending" (clear approvedAtCommit)
 * - skipped   → status = "skipped"
 * - Any other verdict (escalation, error) → leave status as pending
 *
 * T-04 (canon-hash binding): When `currentCanonHash` is provided, approved verdicts record
 * `canonHash = currentCanonHash`. When omitted (3-arg callers), canonHash is set to null.
 * Needs-fix/escalation/pending transitions do not record canonHash (not needed; status=pending
 * means the reviewer must re-run regardless).
 *
 * @param statuses          - Existing status records.
 * @param results           - Map of reviewer name → latest verdict string.
 * @param headSha           - HEAD SHA at round completion time.
 * @param currentCanonHash  - Current canonical docs hash (optional). When provided, recorded on
 *                            approved status. When absent, canonHash is set to null (fail-closed).
 */
export function applyRoundResults(
  statuses: ReviewerStatus[],
  results: Map<string, string>,
  headSha: string,
  currentCanonHash?: string | null,
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
        // Record canonHash from the current round (null when not provided — fail-closed on next resume)
        canonHash: currentCanonHash ?? null,
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
 * - Any escalation → "escalation" (error/halt verdict — NOT absorbed by structural skip)
 * - No escalation, any needs-fix → "needs-fix"
 * - Non-empty, all skipped → "approved" (structural skip, gate pass-through / D-journal)
 * - All approved or mixed approved+skipped → "approved"
 * - Empty list → "approved" (feature unused, member 0 → gate pass-through)
 *
 * Design (round-all-skip-pass-through):
 *   When all members return "skipped" (activation-condition mismatch), the round is a
 *   structural skip — the configuration is authoritative and "all out-of-scope" is a
 *   valid, green outcome. aggregateVerdict returns "approved" so the pipeline proceeds.
 *   per-member skip evidence is preserved in the journal via commitRound.
 *
 *   Error (escalation) is still short-circuited above — skip and error remain distinct.
 *   A single escalation in a mixed set overrides structural skip (requirement 3).
 *
 * Destruction confirmation (TC-003/TC-007): reverting the all-skip case to return
 * "escalation" causes TC-001/TC-002 (awaiting-archive E2E) to fail; removing the
 * escalation short-circuit causes TC-006/TC-007 (error-skip mix) to fail.
 *
 * @param memberVerdicts - Array of verdict strings from each member's last run.
 */
export function aggregateVerdict(
  memberVerdicts: string[],
): "approved" | "needs-fix" | "escalation" {
  let hasNeedsFix = false;
  for (const v of memberVerdicts) {
    if (v === "escalation") return "escalation";
    if (v === "needs-fix") {
      hasNeedsFix = true;
    }
  }
  // Non-empty all-skip or empty → approved (structural skip / feature unused)
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

// ---------------------------------------------------------------------------
// verdictOfResult
// ---------------------------------------------------------------------------

/**
 * Derive a member verdict string from a StepExecutionResult.
 *
 * D1/D3 (round-owned-state-commit): used by ParallelReviewRound coordinator to
 * compute per-member verdicts from producer-only results without reading StepRun
 * arrays persisted by the (now-removed) member executor path.
 *
 * Equivalence with current member verdict derivation
 * (parallel-review-round.ts, pre-T-04):
 *   Current: `lastRun?.outcome.verdict ?? "escalation"` for fulfilled,
 *            `"escalation"` for rejected (halt/throw path).
 *   After:   success → completion.verdict ?? "escalation" (same null-coalesce)
 *            skipped → "skipped"
 *            halt    → "escalation"
 *
 * @param result - Producer result from StepExecutor.produceResult.
 */
export function verdictOfResult(result: StepExecutionResult): string {
  if (result.kind === "success") {
    return result.completion.verdict ?? "escalation";
  }
  if (result.kind === "skipped") {
    return "skipped";
  }
  // halt
  return "escalation";
}
