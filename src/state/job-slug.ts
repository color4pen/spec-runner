/**
 * Pure helpers for deriving the canonical slug from a JobState.
 *
 * Separated from store.ts (I/O responsibility) to keep these functions
 * testable without any filesystem dependency.
 *
 * TC-111: getJobSlug — slug field present → returns slug
 * TC-112: getJobSlug — slug null + branch → prefix-stripped branch
 * TC-113: getJobSlug — slug null + branch empty → request.path basename
 * TC-114: getJobSlug — all sources absent → ""
 * TC-115: stripBranchPrefix — all 5 known prefixes
 */
import * as path from "node:path";
import type { JobState } from "./schema.js";
import { TYPE_CONFIG } from "../config/type-config.js";

/** Known branch prefixes to strip when deriving a slug. Derived from TYPE_CONFIG. */
const BRANCH_PREFIXES = Object.values(TYPE_CONFIG).map((c) => c.branchPrefix);

/**
 * Pattern matching a jobId suffix: hyphen followed by exactly 8 hex characters at end of string.
 * Used to strip the jobId suffix from a branch-derived slug.
 */
const JOB_ID_SUFFIX_PATTERN = /-[0-9a-f]{8}$/;

/**
 * Strip a jobId suffix (e.g. "-45e9e720") from a branch-derived slug.
 * Only strips if the suffix matches exactly 8 lowercase hex characters.
 * No-op if no suffix matches.
 *
 * Examples:
 *   "abolish-success-status-45e9e720" → "abolish-success-status"
 *   "my-feature"                      → "my-feature"
 *   "my-feature-zzzzzzzz"             → "my-feature-zzzzzzzz"  (not hex)
 */
export function stripJobIdSuffix(branchSlug: string): string {
  return branchSlug.replace(JOB_ID_SUFFIX_PATTERN, "");
}

/**
 * Strip a known branch prefix from a branch name.
 * Returns the stripped string, or the original string if no prefix matched.
 *
 * TC-115: strips feat/ fix/ change/ refactor/ chore/
 */
export function stripBranchPrefix(branch: string): string {
  for (const prefix of BRANCH_PREFIXES) {
    if (branch.startsWith(prefix)) {
      return branch.slice(prefix.length);
    }
  }
  return branch;
}

/**
 * Derive the canonical slug from a JobState.
 *
 * Fallback chain:
 *   1. state.request.slug (if non-null and non-empty)
 *   2. state.branch after prefix strip (if branch is non-empty)
 *   3. basename of state.request.path without extension
 *   4. "" (never throws)
 *
 * TC-111: slug field → returns slug
 * TC-112: slug null + branch with known prefix → stripped branch
 * TC-113: slug null + empty branch → request.path basename (no ext)
 * TC-114: all absent → ""
 */
export function getJobSlug(state: JobState): string {
  // 1. Explicit slug field (handle optional field)
  if (state.request.slug) {
    return state.request.slug;
  }

  // 2. Branch with prefix strip + jobId suffix strip
  if (state.branch) {
    const stripped = stripJobIdSuffix(stripBranchPrefix(state.branch));
    if (stripped) return stripped;
  }

  // 3. request.path basename without extension
  if (state.request.path) {
    return path.basename(state.request.path, path.extname(state.request.path));
  }

  // 4. Fallback
  return "";
}
