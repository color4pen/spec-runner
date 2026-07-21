/**
 * Immutable snapshot of a custom reviewer definition stored in JobState.
 *
 * Placed in kernel/ so that persistence (state/) and shared-kernel (prompts/)
 * layers can import this type without creating upward edges into core/.
 *
 * The full ReviewerDefinition (with filename) lives in core/reviewers/types.ts
 * and is only used during load-time parsing and validation.
 */

/**
 * Declarative activation conditions for a reviewer.
 * Both fields are optional; omitting a field removes that constraint.
 * Both present → AND semantics (both conditions must be satisfied).
 *
 * Design D2: CLI evaluates these deterministically from observable facts.
 */
export interface ReviewerActivation {
  /**
   * Glob patterns for changed files.
   * At least one changed file must match at least one pattern.
   */
  paths?: string[];
  /**
   * Request types that activate this reviewer.
   * The job's request type must appear in this list.
   */
  requestTypes?: string[];
}

/**
 * Per-reviewer execution status record stored in JobState.reviewerStatuses.
 *
 * Design D1: parallel execution requires a dedicated status record because
 * `StepRun[]` verdict inference breaks when multiple reviewers complete concurrently.
 *
 * Persisted in state.json as a top-level projection field (same round-trip semantics
 * as `reviewers` / `decisions`). Event-journal threading is NOT required for this field.
 * JSDoc: state.json projection で round-trip、event-journal threading 不要
 */
export interface ReviewerStatus {
  /** Reviewer name (matches ReviewerSnapshot.name). */
  name: string;
  /** Current execution status. */
  status: "pending" | "approved" | "skipped";
  /**
   * HEAD SHA at the time this reviewer was approved (or re-anchored).
   *
   * Dual purpose (T-04 / approval-revision-binding):
   * 1. Invalidation origin: `listChangedFiles(approvedAtCommit, HEAD)` determines
   *    which files the fixer touched since this approval.
   * 2. Revision binding: `selectPendingMembers` skips an approved member only when
   *    `approvedAtCommit === baselineCommit`. Mismatch or null → fail-closed → re-run.
   *
   * Re-anchor: when `listChangedFiles` returns positive evidence that the fixer did
   * NOT touch this reviewer's activation paths, `approvedAtCommit` is updated to the
   * current `baselineCommit` so the binding stays valid without a fresh re-approval.
   *
   * null = not yet approved.
   */
  approvedAtCommit?: string | null;
  /**
   * Activation paths copied from ReviewerSnapshot.paths at status initialization.
   * Used by computeInvalidations to determine whether fixer-touched files overlap.
   * undefined = always-activate reviewer (no path constraint).
   */
  activationPaths?: string[];
  /**
   * HEAD SHA of the commit that invalidated this reviewer (set by computeInvalidations).
   * Present when the reviewer was pending-by-invalidation after a fixer run.
   * null = not invalidated.
   */
  invalidatedByCommit?: string | null;
}

/**
 * Immutable snapshot of a reviewer definition stored in JobState.
 * Captured at job start; used by pipeline composition and step execution.
 * Persisted in state.json.
 */
export interface ReviewerSnapshot {
  /** Reviewer name (e.g. "security"). */
  name: string;
  /** Maximum fixer iterations before exhaustion. */
  maxIterations: number;
  /** Override model for this reviewer (optional). */
  model?: string | undefined;
  /** Content of the 目的 (Purpose) section. */
  purpose: string;
  /** Content of the 観点 (Criteria) section. */
  criteria: string;
  /** Content of the 判定基準 (Judgment) section. */
  judgment: string;
  /** Remaining free-text content (after required sections). */
  freeText: string;
  /**
   * Activation conditions declared in frontmatter.
   * Absent means no conditions (always activate).
   */
  paths?: string[];
  requestTypes?: string[];
}
