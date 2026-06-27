/**
 * Deterministic reviewer activation evaluation.
 *
 * The decision is made from observable facts (changed files, request type),
 * not from LLM judgment. This keeps activation auditable and reproducible.
 *
 * Design D2: AND semantics. Evaluation order: requestTypes → paths.
 * Both conditions absent ⇒ always activate (no restriction).
 */
import type { ReviewerActivation } from "../../kernel/reviewer-snapshot.js";
import { matchGlob } from "./glob-match.js";

/**
 * Runtime facts available at activation-check time.
 */
export interface ActivationFacts {
  /** Repo-relative list of files changed since the base branch. */
  changedFiles: string[];
  /** Request type (e.g. "bug-fix", "new-feature", "spec-change"). */
  requestType: string;
  /**
   * Whether the runtime can mechanically derive `changedFiles`.
   * Optional; defaults to `true` (derivable) when omitted, so existing call sites
   * (e.g. computeInvalidations) are unaffected.
   * When `false`, a `paths` condition cannot be evaluated; the reviewer is activated
   * (fail-closed) rather than silently skipped on an unverifiable path condition.
   */
  changedFilesDerivable?: boolean;
}

/**
 * Result of an activation evaluation.
 */
export interface ActivationDecision {
  /** true → proceed with agent run; false → skip. */
  activated: boolean;
  /**
   * Human-readable reason.
   * When activated=true : always "activated".
   * When activated=false: describes the condition that did not match.
   */
  reason: string;
}

/**
 * Evaluate whether a reviewer should be activated given the declared conditions
 * and the observable runtime facts.
 *
 * Semantics:
 * - Both conditions absent (or cond is undefined) → activated: true.
 * - requestTypes present → request type must appear in the list.
 * - paths present → at least one changed file must match at least one glob.
 * - Both conditions present → BOTH must be satisfied (AND).
 *
 * Never throws. Never performs I/O.
 */
export function evaluateActivation(
  cond: ReviewerActivation | undefined,
  facts: ActivationFacts,
): ActivationDecision {
  // No conditions → always activate
  if (!cond || (!cond.requestTypes && !cond.paths)) {
    return { activated: true, reason: "activated" };
  }

  // Check requestTypes first (cheap string comparison before glob matching)
  if (cond.requestTypes) {
    if (!cond.requestTypes.includes(facts.requestType)) {
      return {
        activated: false,
        reason: `requestType "${facts.requestType}" is not in [${cond.requestTypes.join(", ")}]`,
      };
    }
  }

  // Check paths
  if (cond.paths) {
    // Fail-closed: when changed files cannot be derived (e.g. managed runtime, no
    // git worktree), the `paths` condition is unverifiable. Activate the reviewer
    // (it reviews the whole change) instead of silently skipping it —
    // "判定できない＝該当しうる". Never drop a path reviewer because the runtime
    // cannot list changed files.
    if (facts.changedFilesDerivable === false) {
      return { activated: true, reason: "activated" };
    }
    const matched = facts.changedFiles.some((file) =>
      cond.paths!.some((pattern) => matchGlob(pattern, file)),
    );
    if (!matched) {
      return {
        activated: false,
        reason: `no changed files matched paths [${cond.paths.join(", ")}]`,
      };
    }
  }

  return { activated: true, reason: "activated" };
}
