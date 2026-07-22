/**
 * Pure functions for round-scoped git effect management.
 *
 * D3 (round-owned-git-effects): coordinator owns git side effects for a round.
 * These functions are pure — no I/O, no git dependencies, no executor dependencies.
 *
 * Used by ParallelReviewRound to:
 *   1. Determine which changed files are eligible for the round commit (toStage).
 *   2. Detect undeclared file changes that trigger a round halt (offending).
 */

import { slugStateJsonPath, slugEventsPath, usageJsonPath, changesDirRel, isCanonicalDocPath } from "../../util/paths.js";

/**
 * Filter out pipeline-managed change folder paths from a list of files.
 *
 * Used by the round invalidation logic to exclude findings commits
 * (specrunner/changes/<slug>/...) from the "touched" file list before
 * evaluating reviewer activation paths. This ensures that a reviewer's
 * own findings commit does not spuriously invalidate it in the next round.
 *
 * Excludes:
 *   - The change folder root itself ("specrunner/changes")
 *   - Any path under the change folder ("specrunner/changes/...")
 *
 * Does NOT exclude paths that merely share a prefix with the change folder
 * root (e.g., "specrunner/changes-not-a-child/file.ts" is retained).
 *
 * This is intentionally separate from `pipelineManagedPaths` (which covers
 * only state.json / events.jsonl / usage.json). Invalidation must exclude the
 * entire change folder because findings files (<name>-result-NNN.md, etc.)
 * are also pipeline-managed from the perspective of source diff.
 *
 * @param files - Worktree-relative file paths (e.g. from listChangedFiles).
 * @returns Files that are not under the pipeline-managed change folder.
 */
export function excludeChangeFolderPaths(files: string[]): string[] {
  const root = changesDirRel();
  const prefix = `${root}/`;
  return files.filter((f) => f !== root && !f.startsWith(prefix));
}

/**
 * Filter out pipeline-managed change folder paths from a list of files.
 * Preserves canonical documents (request.md / spec.md / design.md / tasks.md / test-cases.md)
 * so that changes to them appear in the invalidation diff and trigger reviewer re-runs.
 *
 * Excludes (pipeline output paths):
 *   - Non-canonical paths under the change folder root (findings files, state.json,
 *     events.jsonl, usage.json, rules.md, attestation.json, etc.)
 *   - The change folder root directory itself ("specrunner/changes")
 *
 * Preserves:
 *   - Canonical documents directly under specrunner/changes/<slug>/
 *     (request.md / spec.md / design.md / tasks.md / test-cases.md)
 *   - All paths outside the change folder (src/, specrunner/reviewers/, etc.)
 *   - Same-prefix-different-directory paths (e.g. "specrunner/changes-not-a-child/...")
 *
 * Replaces excludeChangeFolderPaths for the invalidation diff path (T-02).
 * The existing goal is maintained: reviewer's own findings commit does not spuriously
 * invalidate it — findings files are pipeline outputs and are excluded.
 *
 * Destruction confirmation (TC-047): if reverted to excludeChangeFolderPaths (full exclusion),
 * TC-005 and TC-016 fail because canonical docs would be excluded from the invalidation diff.
 *
 * @param files - Worktree-relative file paths (e.g. from listChangedFiles).
 * @returns Files that are not pipeline-managed change folder outputs (canonical docs preserved).
 */
export function excludePipelineManagedChangePaths(files: string[]): string[] {
  const root = changesDirRel();
  const prefix = `${root}/`;
  return files.filter((f) => {
    // Not under the change folder root → preserve (src/, specrunner/reviewers/, etc.)
    if (f !== root && !f.startsWith(prefix)) return true;
    // Under change folder: preserve only canonical documents
    return isCanonicalDocPath(f);
  });
}

/**
 * Returns the set of pipeline-managed paths for a given slug.
 *
 * Pipeline-managed paths are excluded from:
 *   - halt detection (offending check): written by the runner, not by agents.
 *   - scoped staging (toStage): excluded from the round commit to avoid capturing
 *     state/event/usage churn that is already committed by the pipeline's own seams.
 *
 * @param slug - The job slug.
 * @returns Array of pipeline-managed worktree-relative paths.
 */
export function pipelineManagedPaths(slug: string): string[] {
  return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug)];
}

/**
 * Partition round changes into scoped stage candidates and offending paths.
 *
 * Definitions:
 * - toStage:   changed ∩ declared — files that were actually changed AND are declared
 *              outputs of the round members.  Passed to commitRoundArtifacts.
 * - offending: changed − declared − pipelineManaged — files that changed but are
 *              neither declared outputs nor pipeline-managed.  Any offending path
 *              causes the coordinator to halt the entire round.
 *
 * Pipeline-managed paths (state.json, events.jsonl, usage.json) are excluded from
 * both toStage and offending — they are written by the pipeline runner, not agents,
 * and should never trigger a halt or be staged in the round commit.
 *
 * Member-level attribution is impossible in a shared worktree; detection is
 * therefore round-scoped: if any member left an undeclared change, the round halts.
 *
 * Declared files not present in changed are simply absent from toStage (the member
 * did not write them — no pathspec mismatch).
 *
 * @param changed  - Worktree-relative paths that changed (from listWorktreeChanges).
 * @param declared - Union of all round member declared outputs (from writes()).
 * @param slug     - The job slug (used to derive pipeline-managed paths).
 * @returns { toStage, offending }
 */
export function partitionRoundChanges({
  changed,
  declared,
  slug,
}: {
  changed: string[];
  declared: string[];
  slug: string;
}): { toStage: string[]; offending: string[] } {
  const managedSet = new Set(pipelineManagedPaths(slug));
  const declaredSet = new Set(declared);

  // changed ∩ declared (only actually-changed declared outputs go to stage)
  const toStage = changed.filter((f) => declaredSet.has(f));

  // changed − declared − pipelineManaged
  const offending = changed.filter((f) => !managedSet.has(f) && !declaredSet.has(f));

  return { toStage, offending };
}
