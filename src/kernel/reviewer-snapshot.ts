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
