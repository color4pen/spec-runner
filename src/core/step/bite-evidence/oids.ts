/**
 * OID resolution helpers for the bite-evidence gate (R4, bite-evidence-forward).
 *
 * Resolves base and candidate commit OIDs from job state:
 *   - base     = latest test-materialize step run's commitOid
 *   - candidate = latest implementer step run's commitOid
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
 * - candidate: latest `implementer` run's `commitOid`
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
 * Detect whether the base (latest test-materialize commit) has implementer commits
 * mixed into it — indicating a re-run where the assumption "base = no implementation"
 * no longer holds.
 *
 * Returns the commitOid of the earliest offending implementer run (one that started
 * before the base test-materialize run), or null if the base is clean.
 *
 * Pure function — no I/O.
 *
 * ponytail: startedAt 全順序に依存。Evidence Base 導入時に tree 合成へ置換。
 */
export function detectBaseImplementationContamination(state: JobState): string | null {
  const steps = state.steps ?? {};
  const baseRuns = steps[STEP_NAMES.TEST_MATERIALIZE] ?? [];
  const implementerRuns = steps[STEP_NAMES.IMPLEMENTER] ?? [];

  const latestBase = baseRuns[baseRuns.length - 1];
  if (!latestBase) return null;

  for (const run of implementerRuns) {
    if (run.commitOid && run.startedAt < latestBase.startedAt) {
      return run.commitOid;
    }
  }

  return null;
}
