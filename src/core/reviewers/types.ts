/**
 * Types for custom reviewer definitions.
 *
 * Reviewers are declared as markdown files in `specrunner/reviewers/<name>.md`.
 * At job start, definitions are loaded, validated, and snapshotted into JobState.
 * The snapshot is used throughout the job lifecycle to keep pipeline shape stable.
 */

// ReviewerSnapshot lives in kernel/ so persistence/shared-kernel layers can import it.
export type { ReviewerSnapshot } from "../../kernel/reviewer-snapshot.js";

/**
 * Maximum allowed maxIterations value for a custom reviewer.
 * Matches the standard pipeline's upper bound.
 */
export const MAX_REVIEWER_ITERATIONS = 10;

/**
 * Parsed representation of a `specrunner/reviewers/<name>.md` file.
 * Produced by parseReviewerDefinition; consumed by validateReviewerDefinitions.
 */
export interface ReviewerDefinition {
  /** Reviewer name (from frontmatter; must match filename stem). */
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
  /** Source filename (e.g. "security.md") — for validation error messages. */
  filename: string;
  /**
   * Glob patterns for changed files (from frontmatter `paths:`).
   * When present, at least one changed file must match for the reviewer to activate.
   * Absent means no path constraint.
   */
  paths?: string[];
  /**
   * Request types that activate this reviewer (from frontmatter `requestTypes:`).
   * When present, the job's request type must appear in this list.
   * Absent means no request-type constraint.
   */
  requestTypes?: string[];
}

/**
 * A single validation violation for a reviewer definition file.
 */
export interface ReviewerViolation {
  /** The source filename (e.g. "security.md"). */
  filename: string;
  /** Human-readable violation description. */
  message: string;
}

/**
 * Thrown by validateReviewerDefinitions when one or more violations are found.
 * All violations are collected into a single throw to give the full picture.
 */
export class ReviewerValidationError extends Error {
  constructor(
    message: string,
    public readonly violations: ReviewerViolation[],
  ) {
    super(message);
    this.name = "ReviewerValidationError";
  }
}
