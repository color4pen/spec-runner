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
 * Returns the relative path to the conformance result file for the given slug and iteration.
 * Iteration is zero-padded to 3 digits.
 * Example: conformanceResultPath("foo", 1) → "specrunner/changes/foo/conformance-result-001.md"
 */
export function conformanceResultPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `${CHANGES_DIR}/${slug}/conformance-result-${nnn}.md`;
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

/** Base directory for archived changes. */
const ARCHIVE_DIR = `${CHANGES_DIR}/archive`;

/**
 * Returns the relative path to the archived changes directory (no trailing slash).
 * Example: archivedChangesDirRel() → "specrunner/changes/archive"
 */
export function archivedChangesDirRel(): string {
  return ARCHIVE_DIR;
}

/**
 * Returns the relative path to the archived change folder for the given datedSlug.
 * The datedSlug is expected to be in the form "<YYYY-MM-DD>-<slug>".
 * Example: archivedChangeFolderPath("2026-05-20-my-change") → "specrunner/changes/archive/2026-05-20-my-change"
 */
export function archivedChangeFolderPath(datedSlug: string): string {
  return `${ARCHIVE_DIR}/${datedSlug}`;
}

/**
 * Returns the relative path to the project-level context file.
 * Example: projectMdPath() → "specrunner/project.md"
 */
export function projectMdPath(): string {
  return "specrunner/project.md";
}

/**
 * Returns the relative path to the rules.md copy inside the change folder.
 * Example: rulesDestPath("my-change") → "specrunner/changes/my-change/rules.md"
 */
export function rulesDestPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/rules.md`;
}

/** Base directory for draft requests (not yet run). */
const DRAFTS_DIR = "specrunner/drafts";

/**
 * Returns the relative path to the drafts directory (no trailing slash).
 * Example: draftsDir() → "specrunner/drafts"
 */
export function draftsDir(): string {
  return DRAFTS_DIR;
}

/**
 * Returns the relative path to a draft request file for the given slug.
 * Example: draftPath("my-change") → "specrunner/drafts/my-change/request.md"
 */
export function draftPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}/request.md`;
}

/**
 * Returns the relative path to a draft request file in legacy flat-file format.
 * Example: draftPathLegacy("my-change") → "specrunner/drafts/my-change.md"
 */
export function draftPathLegacy(slug: string): string {
  return `${DRAFTS_DIR}/${slug}.md`;
}

/** Base directory for project-level step rules. */
const RULES_DIR = "specrunner/rules";

/**
 * Returns the relative path to the rules directory for a given step name.
 * Example: stepRulesDirRel("design") → "specrunner/rules/design"
 */
export function stepRulesDirRel(stepName: string): string {
  return `${RULES_DIR}/${stepName}`;
}

/** Regex to detect YYYY-MM-DD prefix on an archive dir name. */
const ARCHIVE_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/**
 * Parses an archive directory name, stripping the optional YYYY-MM-DD prefix.
 *
 * Examples:
 *   parseArchiveDirName("2026-05-20-foo-bar")   → { date: "2026-05-20", slug: "foo-bar" }
 *   parseArchiveDirName("foo-bar")               → { date: null, slug: "foo-bar" }
 */
export function parseArchiveDirName(dirName: string): { date: string | null; slug: string } {
  const m = ARCHIVE_DATE_PREFIX_RE.exec(dirName);
  if (m) return { date: m[1] as string, slug: m[2] as string };
  return { date: null, slug: dirName };
}

/**
 * Returns the relative path to the usage.json file for a draft.
 * Example: draftUsageJsonPath("foo") → "specrunner/drafts/foo/usage.json"
 */
export function draftUsageJsonPath(slug: string): string {
  return `${DRAFTS_DIR}/${slug}/usage.json`;
}

/**
 * Returns the relative path to the usage.json file for a change folder.
 * Example: usageJsonPath("foo") → "specrunner/changes/foo/usage.json"
 */
export function usageJsonPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/usage.json`;
}
