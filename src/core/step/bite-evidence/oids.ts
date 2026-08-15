/**
 * OID resolution helpers for the bite-evidence gate (R4, bite-evidence-forward).
 *
 * Evidence Base ref = first parent of the bootstrap commit (synthesizedCommits[0]^).
 * Written by the executor immediately after the bootstrap commit.
 * Survives resume via the event-journal fold.
 *
 * absorb-test-materialize: resolveBaseCandidateOids removed —
 * file-set identification now uses listChangedFilesBetweenCommits(evidenceBaseRev, headOid).
 */

import type { JobState } from "../../../state/schema.js";

/**
 * Resolve the Evidence Base revision for a job.
 *
 * The Evidence Base = immutable job base tree + candidate test overlay.
 * The job base is the base-branch tree at job start, derived as the first
 * parent of the bootstrap commit (`synthesizedCommits[0]^`).
 *
 * `synthesizedCommits[0]` is the bootstrap commit ("add request.md for <slug>"),
 * created on the feature branch on top of the fork point before any pipeline step
 * runs. Its first parent is the immutable fork point = base-branch tree at job start.
 * This survives resume via the journal fold and never changes regardless of how many
 * times `test-materialize` or `implementer` runs.
 *
 * Returns `null` when `synthesizedCommits` is absent or empty (legacy / pre-ledger
 * state) — callers should treat null as fail-closed (strategy-deferred / absent).
 *
 * Pure function — no I/O.
 */
export function resolveEvidenceBaseRev(state: JobState): string | null {
  const commits = state.synthesizedCommits;
  if (!commits || commits.length === 0) return null;
  return `${commits[0]}^`;
}
