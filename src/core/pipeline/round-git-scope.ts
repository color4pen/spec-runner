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

import { slugStateJsonPath, slugEventsPath, usageJsonPath } from "../../util/paths.js";

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
