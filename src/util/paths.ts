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
 * Returns the relative path to the request-review result file for the given slug and iteration.
 * Iteration is zero-padded to 3 digits.
 * Example: requestReviewResultPath("my-change", 1) → "specrunner/changes/my-change/request-review-result-001.md"
 */
export function requestReviewResultPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `${CHANGES_DIR}/${slug}/request-review-result-${nnn}.md`;
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

/** Base directory for canceled changes. */
const CANCELED_DIR = `${CHANGES_DIR}/canceled`;

/**
 * Returns the relative path to the canceled changes directory (no trailing slash).
 * Example: canceledChangesDirRel() → "specrunner/changes/canceled"
 */
export function canceledChangesDirRel(): string {
  return CANCELED_DIR;
}

/**
 * Returns the relative path to the canceled change folder for the given dirName.
 * The dirName is expected to be in the form "<slug>-<jobId8>".
 * Example: canceledChangeFolderPath("my-change-12345678") → "specrunner/changes/canceled/my-change-12345678"
 */
export function canceledChangeFolderPath(dirName: string): string {
  return `${CANCELED_DIR}/${dirName}`;
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

/** Base directory for custom reviewer definitions. */
const REVIEWERS_DIR = "specrunner/reviewers";

/**
 * Returns the relative path to the custom reviewers directory.
 * Example: reviewersDirRel() → "specrunner/reviewers"
 */
export function reviewersDirRel(): string {
  return REVIEWERS_DIR;
}

/**
 * Returns the relative path to a custom reviewer result file for the given slug, reviewer name, and iteration.
 * Iteration is zero-padded to 3 digits.
 * Example: customReviewerResultPath("foo", "security", 2) → "specrunner/changes/foo/security-result-002.md"
 */
export function customReviewerResultPath(slug: string, name: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `${CHANGES_DIR}/${slug}/${name}-result-${nnn}.md`;
}

/**
 * Unified resolver for reviewer result file paths.
 *
 * Returns reviewFeedbackPath for the built-in code-review step, and
 * customReviewerResultPath for all other (custom) reviewer steps.
 * This allows code-fixer to look up the correct findings file regardless
 * of whether it was sent by code-review or a custom reviewer.
 *
 * Example:
 *   resolveReviewerResultPath("foo", "code-review", 1) → "specrunner/changes/foo/review-feedback-001.md"
 *   resolveReviewerResultPath("foo", "security", 1)    → "specrunner/changes/foo/security-result-001.md"
 *
 * TC-034: this file MUST NOT import from any other src/ module. The "code-review" literal
 * here is the canonical step name, not a cross-module dependency.
 */
export function resolveReviewerResultPath(slug: string, stepName: string, iteration: number): string {
  if (stepName === "code-review") {
    return reviewFeedbackPath(slug, iteration);
  }
  return customReviewerResultPath(slug, stepName, iteration);
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

/**
 * Returns the relative path to state.json for the slug-based split layout
 * (relative to worktreePath / stateRoot).
 * Example: slugStateJsonPath("foo") → "specrunner/changes/foo/state.json"
 */
export function slugStateJsonPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/state.json`;
}

/**
 * Returns the relative path to events.jsonl for the slug-based split layout
 * (relative to worktreePath / stateRoot).
 * Example: slugEventsPath("foo") → "specrunner/changes/foo/events.jsonl"
 */
export function slugEventsPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/events.jsonl`;
}

/** Base directory for machine-local sidecar files (relative to repoRoot). */
const LOCAL_SIDECAR_BASE = ".specrunner/local";

/**
 * Returns the directory path for the machine-local sidecar for a slug
 * (relative to repoRoot).
 * Example: localSidecarDir("foo") → ".specrunner/local/foo"
 */
export function localSidecarDir(slug: string): string {
  return `${LOCAL_SIDECAR_BASE}/${slug}`;
}

/**
 * Returns the path to liveness.json sidecar for a slug (relative to repoRoot).
 * Contains: { pid, session, worktreePath, jobId }
 * Example: livenessJsonPath("foo") → ".specrunner/local/foo/liveness.json"
 */
export function livenessJsonPath(slug: string): string {
  return `${LOCAL_SIDECAR_BASE}/${slug}/liveness.json`;
}

/**
 * Returns the path to marker.json for a managed job slug (relative to repoRoot).
 * Example: managedMarkerPath("foo") → ".specrunner/local/foo/marker.json"
 */
export function managedMarkerPath(slug: string): string {
  return `${LOCAL_SIDECAR_BASE}/${slug}/marker.json`;
}

/**
 * Returns the relative path to the base directory for all machine-local sidecar files.
 * Example: localSidecarBaseDirRel() → ".specrunner/local"
 */
export function localSidecarBaseDirRel(): string {
  return LOCAL_SIDECAR_BASE;
}

/**
 * Returns the relative path to state.json for the machine-local managed job store.
 * (relative to repoRoot)
 * Example: localSlugStateJsonPath("foo") → ".specrunner/local/foo/state.json"
 */
export function localSlugStateJsonPath(slug: string): string {
  return `${LOCAL_SIDECAR_BASE}/${slug}/state.json`;
}

/**
 * Returns the relative path to events.jsonl for the machine-local managed job store.
 * (relative to repoRoot)
 * Example: localSlugEventsPath("foo") → ".specrunner/local/foo/events.jsonl"
 */
export function localSlugEventsPath(slug: string): string {
  return `${LOCAL_SIDECAR_BASE}/${slug}/events.jsonl`;
}
