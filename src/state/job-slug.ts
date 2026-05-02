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

/** Known branch prefixes to strip when deriving a slug. */
const BRANCH_PREFIXES = ["feat/", "fix/", "change/", "refactor/", "chore/"];

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

  // 2. Branch with prefix strip
  if (state.branch) {
    const stripped = stripBranchPrefix(state.branch);
    if (stripped) return stripped;
  }

  // 3. request.path basename without extension
  if (state.request.path) {
    return path.basename(state.request.path, path.extname(state.request.path));
  }

  // 4. Fallback
  return "";
}
