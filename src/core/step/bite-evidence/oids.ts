/**
 * OID resolution helpers for the bite-evidence gate (R4, bite-evidence-forward).
 *
 * Resolves base and candidate commit OIDs from job state:
 *   - base     = latest test-materialize step run's commitOid (for file-set identification)
 *   - Evidence Base ref = first parent of the bootstrap commit (synthesizedCommits[0]^)
 *
 * Both OIDs are written by the executor (T-02) immediately after the per-node commit.
 * They survive resume via the event-journal fold (T-01).
 */

import type { JobState } from "../../../state/schema.js";
import { STEP_NAMES } from "../../../kernel/step-names.js";

/**
 * Resolve the base and candidate commit OIDs from job state.
 *
 * - base:      latest `test-materialize` run's `commitOid`
 *   (still used for materialized-test-file *set* identification — design D3)
 * - candidate: latest `implementer` run's `commitOid`
 *   (retained for compatibility; green candidate is now HEAD, not this OID)
 *
 * Returns `null` for each OID when:
 *   - The step has no runs recorded, OR
 *   - The latest run does not have a `commitOid` field (legacy records pre-R4).
 *
 * Pure function — no I/O.
 */
export function resolveBaseCandidateOids(state: JobState): {
  baseOid: string | null;
  candidateOid: string | null;
} {
  const steps = state.steps ?? {};

  const baseRuns = steps[STEP_NAMES.TEST_MATERIALIZE] ?? [];
  const candidateRuns = steps[STEP_NAMES.IMPLEMENTER] ?? [];

  const latestBase = baseRuns[baseRuns.length - 1];
  const latestCandidate = candidateRuns[candidateRuns.length - 1];

  const baseOid = latestBase?.commitOid ?? null;
  const candidateOid = latestCandidate?.commitOid ?? null;

  return { baseOid, candidateOid };
}

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
