/**
 * Protected-path decision logic for the merge guard.
 *
 * Evaluates whether auto-merge should be blocked based on changed files
 * and configured glob patterns.
 */
import { globMatch } from "../../util/glob-match.js";

/** Result of evaluating protected paths against a PR's changed files. */
export interface ProtectedPathDecision {
  /** Whether auto-merge must be blocked. */
  blocked: boolean;
  /**
   * Reason for the decision:
   *   "none"      — no block (patterns empty, or no matching file)
   *   "match"     — at least one changed file matched a protected pattern
   *   "truncated" — the changed file list was truncated by the GitHub API cap
   */
  reason: "none" | "match" | "truncated";
  /** Files that matched a protected pattern (populated only when reason === "match"). */
  matched: string[];
}

export interface EvaluateProtectedPathsInput {
  /** Repo-root-relative POSIX paths of files changed by the PR. */
  changedFiles: string[];
  /** Whether the file list was truncated by the GitHub API 3000-file cap. */
  truncated: boolean;
  /** Glob patterns from archive.protectedPaths config. */
  patterns: string[];
}

/**
 * Evaluate whether the merge gate should block auto-merge.
 *
 * Decision order (fail-closed design):
 * 1. Empty `patterns` → not blocked (backward compatible; checked before truncated).
 * 2. `truncated` → blocked with reason "truncated" (incomplete data → fail-closed).
 * 3. Any `changedFile` matches any pattern → blocked with reason "match".
 * 4. No match → not blocked.
 */
export function evaluateProtectedPaths(input: EvaluateProtectedPathsInput): ProtectedPathDecision {
  const { changedFiles, truncated, patterns } = input;

  // (1) No patterns → no guard
  if (patterns.length === 0) {
    return { blocked: false, reason: "none", matched: [] };
  }

  // (2) Truncated list with non-empty patterns → fail-closed
  if (truncated) {
    return { blocked: true, reason: "truncated", matched: [] };
  }

  // (3) Match check
  const matched: string[] = [];
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (globMatch(file, pattern)) {
        matched.push(file);
        break; // each file counted once
      }
    }
  }

  if (matched.length > 0) {
    return { blocked: true, reason: "match", matched };
  }

  // (4) No match
  return { blocked: false, reason: "none", matched: [] };
}
