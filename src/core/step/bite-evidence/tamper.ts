/**
 * Tamper detection for the bite-evidence gate — provenance-based.
 *
 * Verifies that the last change to test-cases.md is attributable to an authorized
 * change path (an owner step or an operator-apply commit). The check is based on
 * the sole-committer invariant: every pipeline step change is recorded as a step-named
 * commit (e.g. "spec-fixer: <slug>"), which is durable even when lineage recording
 * (appendLineage) fails.
 *
 * Contract:
 * - match:        last change was by an authorized writer → proceed.
 * - mismatch:     last change was by an unauthorized writer, or worktree has uncommitted
 *                 changes to test-cases.md → fail-closed.
 * - inconclusive: provenance could not be derived (runtime unavailable, no git history,
 *                 authorizedWriters empty) → proceed (fail-open).
 *
 * Motivation: spec-fixer owns test-cases.md via writes() and can legitimately edit it
 * during a spec-review finding cycle. The old hash-comparison approach treated such
 * legitimate edits as tamper, producing false-positive halts. The provenance approach
 * asks "who made the last change?" instead of "is the hash frozen?".
 *
 * The gate (gate.ts) treats:
 *   - mismatch     → failed (fail-closed)
 *   - inconclusive → proceed with base/candidate evaluation
 *   - match        → proceed
 */

export type TamperStatus = "match" | "mismatch" | "inconclusive";

export interface TamperCheckResult {
  status: TamperStatus;
}

/**
 * Provenance-based tamper classification.
 *
 * All inputs are pre-computed by the caller; this function is pure.
 *
 * Classification order (D1):
 *   1. evidenceAvailable === false → inconclusive (cannot determine provenance)
 *   2. worktreeDirty === true      → mismatch (uncommitted changes = unauthorized write)
 *   3. lastCanonCommitToken === null → inconclusive (no git history — file never committed)
 *   4. authorizedWriters.has(lastCanonCommitToken) → match (authorized change path)
 *   5. otherwise                   → mismatch (unauthorized change path)
 *
 * @param input.authorizedWriters     Set of authorized step/operator tokens
 *                                    (e.g. { "test-case-gen", "spec-fixer", "operator-apply" }).
 * @param input.lastCanonCommitToken  Token extracted from the last commit that touched
 *                                    test-cases.md (via parseCommitToken). null when
 *                                    the path has no git history.
 * @param input.worktreeDirty         true when test-cases.md has uncommitted changes.
 * @param input.evidenceAvailable     false when any required evidence (authorizedWriters,
 *                                    lastCommitTouchingPath, listWorktreeChanges) could
 *                                    not be derived.
 */
export function checkTamperStatus(input: {
  authorizedWriters: ReadonlySet<string>;
  lastCanonCommitToken: string | null;
  worktreeDirty: boolean;
  evidenceAvailable: boolean;
}): TamperCheckResult {
  const { authorizedWriters, lastCanonCommitToken, worktreeDirty, evidenceAvailable } = input;

  // 1. Evidence unavailable → inconclusive (fail-open; cannot determine provenance)
  if (!evidenceAvailable) {
    return { status: "inconclusive" };
  }

  // 2. Uncommitted changes to test-cases.md → mismatch (unauthorized in-flight write)
  if (worktreeDirty) {
    return { status: "mismatch" };
  }

  // 3. No git history for the path → inconclusive (cannot attribute; proceed)
  if (lastCanonCommitToken === null) {
    return { status: "inconclusive" };
  }

  // 4. Last commit token is an authorized writer → match
  if (authorizedWriters.has(lastCanonCommitToken)) {
    return { status: "match" };
  }

  // 5. Token exists but is not authorized → mismatch (fail-closed)
  return { status: "mismatch" };
}

/**
 * Extract the step/operator attribution token from a pipeline commit subject.
 *
 * Pipeline commits follow the convention "<token>: <slug>" where <token> is the
 * step name (e.g. "spec-fixer") or "operator-apply". Returns the token only when
 * the subject matches the given slug exactly — cross-slug attribution is rejected
 * to prevent accidental authorization of changes from other jobs.
 *
 * Returns null when:
 *   - The subject does not contain ": " (non-conforming commit message).
 *   - The part after ": " does not match <slug> exactly.
 *
 * @param subject - Commit subject line (first line of commit message).
 * @param slug    - Expected job slug (e.g. "my-feature").
 * @returns The token string (e.g. "spec-fixer") or null.
 */
export function parseCommitToken(subject: string, slug: string): string | null {
  const sep = ": ";
  const idx = subject.indexOf(sep);
  if (idx === -1) {
    return null; // non-conforming subject
  }
  const token = subject.slice(0, idx);
  const subjectSlug = subject.slice(idx + sep.length);
  if (subjectSlug !== slug) {
    return null; // cross-slug mismatch — reject to prevent accidental authorization
  }
  return token || null; // empty token is not valid
}
