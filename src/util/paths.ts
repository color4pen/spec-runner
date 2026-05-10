/**
 * Path utility functions for specrunner change folder and related paths.
 *
 * All functions return relative paths (no leading slash, no cwd prefix).
 * Callers that need absolute paths should use: path.join(cwd, changeFolderPath(slug))
 *
 * Design D1: placed in src/util/ alongside other stateless utilities (slugify, spawn, etc.)
 * Design D2: pure functions only — no imports from other src/ modules.
 * TC-034: this file MUST NOT import from any other src/ module.
 */

/** Base directory for all changes. */
const CHANGES_DIR = "specrunner/changes";

/**
 * Returns the relative path to the change folder for the given slug.
 * Example: changeFolderPath("my-change") → "specrunner/changes/my-change"
 */
export function changeFolderPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}`;
}

/**
 * Returns the relative path to the spec-review result file for the given slug and iteration.
 * Iteration is zero-padded to 3 digits.
 * Example: specReviewResultPath("my-change", 1) → "specrunner/changes/my-change/spec-review-result-001.md"
 */
export function specReviewResultPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `${CHANGES_DIR}/${slug}/spec-review-result-${nnn}.md`;
}

/**
 * Returns the relative path to the review feedback file for the given slug and iteration.
 * Iteration is zero-padded to 3 digits.
 * Example: reviewFeedbackPath("my-change", 2) → "specrunner/changes/my-change/review-feedback-002.md"
 */
export function reviewFeedbackPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `${CHANGES_DIR}/${slug}/review-feedback-${nnn}.md`;
}

/**
 * Returns the relative path to the verification result file for the given slug.
 * Example: verificationResultPath("my-change") → "specrunner/changes/my-change/verification-result.md"
 */
export function verificationResultPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/verification-result.md`;
}

/**
 * Returns the relative path to the pr-create result file for the given slug.
 * Example: prCreateResultPath("my-change") → "specrunner/changes/my-change/pr-create-result.md"
 */
export function prCreateResultPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/pr-create-result.md`;
}

/**
 * Returns the relative path to the request.md file for the given slug.
 * Example: requestMdPath("my-change") → "specrunner/changes/my-change/request.md"
 */
export function requestMdPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/request.md`;
}

/**
 * Returns the relative path to the changes directory (no trailing slash).
 * Example: changesDirRel() → "specrunner/changes"
 */
export function changesDirRel(): string {
  return CHANGES_DIR;
}
