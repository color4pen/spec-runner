/**
 * OID capture tests for bite-evidence-forward.
 *
 * Verifies:
 *   - TC-010: commitOid round-trips through stepRunToRecord and fold unchanged
 *
 * absorb-test-materialize: TC-001 and TC-002 (resolveBaseCandidateOids) removed —
 * resolveBaseCandidateOids is abolished; TC-002 (resolveEvidenceBaseRev) lives in
 * evidence-base-oids.test.ts.
 */

import { describe, it, expect } from "vitest";
import { fold, stepRunToRecord } from "../../../../store/event-journal.js";
import type { StepRun } from "../../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal StepRun with an optional commitOid.
 */
function makeStepRun(overrides: Partial<StepRun> = {}): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: "success",
      findingsPath: null,
      error: null,
    },
    startedAt: "2026-01-01T00:01:00.000Z",
    endedAt: "2026-01-01T00:02:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-010: commitOid round-trips through stepRunToRecord and fold
// ---------------------------------------------------------------------------

describe("TC-010: commitOid round-trips through stepRunToRecord and fold", () => {
  it("TC-010: a StepRun with commitOid round-trips unchanged via stepRunToRecord → fold", () => {
    const commitOid = "abc123def456";
    const run = makeStepRun({ commitOid } as StepRun & { commitOid: string });

    // Serialize to journal record
    const record = stepRunToRecord("test-materialize", run);

    // The record should carry the commitOid
    expect((record as Record<string, unknown>)["commitOid"]).toBe(commitOid);

    // Fold back from journal
    const journalLine = JSON.stringify(record);
    const result = fold(journalLine);

    const runs = result.steps["test-materialize"];
    expect(runs).toBeDefined();
    expect(runs).toHaveLength(1);

    // The reconstructed StepRun should have the same commitOid
    const reconstructed = runs![0]!;
    expect((reconstructed as StepRun & { commitOid?: string }).commitOid).toBe(commitOid);
  });

  it("TC-010: a StepRun without commitOid folds to undefined (no field set)", () => {
    const run = makeStepRun(); // no commitOid
    const record = stepRunToRecord("implementer", run);

    // The record should NOT have commitOid
    expect((record as Record<string, unknown>)["commitOid"]).toBeUndefined();

    // Fold back
    const journalLine = JSON.stringify(record);
    const result = fold(journalLine);

    const runs = result.steps["implementer"];
    expect(runs).toBeDefined();
    const reconstructed = runs![0]!;
    expect((reconstructed as StepRun & { commitOid?: string }).commitOid).toBeUndefined();
  });
});

