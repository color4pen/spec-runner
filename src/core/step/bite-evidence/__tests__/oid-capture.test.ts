/**
 * OID capture tests for bite-evidence-forward.
 *
 * Verifies:
 *   - TC-001: base and candidate OIDs are recorded after their commits
 *   - TC-002: recorded OIDs survive a resume (fold/stepRunToRecord round-trip)
 *   - TC-010: commitOid round-trips through stepRunToRecord and fold unchanged
 *
 * These tests reference the new `commitOid` field on `StepRun` and
 * `StepAttemptRecord` added by T-01, and `resolveBaseCandidateOids` from T-03.
 */

import { describe, it, expect } from "vitest";
import { fold, stepRunToRecord } from "../../../../store/event-journal.js";
import type { StepRun } from "../../../../state/schema.js";
import { resolveBaseCandidateOids } from "../oids.js";
import type { JobState } from "../../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "oid-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// TC-001: base and candidate OIDs are recorded after their commits
// ---------------------------------------------------------------------------

describe("TC-001: base and candidate OIDs are recorded in their respective step runs", () => {
  it("TC-001: resolveBaseCandidateOids returns baseOid from test-materialize run", () => {
    const state = makeBaseState({
      steps: {
        "test-materialize": [
          { ...makeStepRun(), commitOid: "base-sha-001" } as StepRun & { commitOid: string },
        ],
        "implementer": [
          { ...makeStepRun(), commitOid: "candidate-sha-001" } as StepRun & { commitOid: string },
        ],
      },
    });

    const { baseOid, candidateOid } = resolveBaseCandidateOids(state);
    expect(baseOid).toBe("base-sha-001");
    expect(candidateOid).toBe("candidate-sha-001");
  });

  it("TC-001: resolveBaseCandidateOids returns null when step has no runs", () => {
    const state = makeBaseState({ steps: {} });
    const { baseOid, candidateOid } = resolveBaseCandidateOids(state);
    expect(baseOid).toBeNull();
    expect(candidateOid).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-002: recorded OIDs survive a resume (fold round-trip)
// ---------------------------------------------------------------------------

describe("TC-002: recorded OIDs survive a resume via fold round-trip", () => {
  it("TC-002: commitOid from test-materialize persists and reloads unchanged via journal fold", () => {
    const baseCommitOid = "base-sha-resume-001";
    const candidateCommitOid = "candidate-sha-resume-001";

    const baseRun = { ...makeStepRun(), commitOid: baseCommitOid } as StepRun & { commitOid: string };
    const candidateRun = { ...makeStepRun(), commitOid: candidateCommitOid } as StepRun & { commitOid: string };

    const baseRecord = stepRunToRecord("test-materialize", baseRun);
    const candidateRecord = stepRunToRecord("implementer", candidateRun);

    // Simulate the journal lines as they would appear in events.jsonl
    const journalContent = [
      JSON.stringify(baseRecord),
      JSON.stringify(candidateRecord),
    ].join("\n");

    const result = fold(journalContent);

    // Reconstruct and verify OIDs are preserved
    const testMaterializeRuns = result.steps["test-materialize"];
    const implementerRuns = result.steps["implementer"];

    expect(testMaterializeRuns).toHaveLength(1);
    expect(implementerRuns).toHaveLength(1);

    const reloadedBase = testMaterializeRuns![0]! as StepRun & { commitOid?: string };
    const reloadedCandidate = implementerRuns![0]! as StepRun & { commitOid?: string };

    expect(reloadedBase.commitOid).toBe(baseCommitOid);
    expect(reloadedCandidate.commitOid).toBe(candidateCommitOid);
  });

  it("TC-002: resolveBaseCandidateOids on reloaded state returns the correct OIDs", () => {
    const baseCommitOid = "base-sha-resume-002";
    const candidateCommitOid = "candidate-sha-resume-002";

    // Simulate a journal fold restoring the step runs with commitOid
    const baseRun = { ...makeStepRun({ attempt: 1 }), commitOid: baseCommitOid } as StepRun & { commitOid: string };
    const candidateRun = { ...makeStepRun({ attempt: 1 }), commitOid: candidateCommitOid } as StepRun & { commitOid: string };

    const journalContent = [
      JSON.stringify(stepRunToRecord("test-materialize", baseRun)),
      JSON.stringify(stepRunToRecord("implementer", candidateRun)),
    ].join("\n");

    const foldResult = fold(journalContent);

    // Reconstruct a minimal state from fold result
    const state = makeBaseState({ steps: foldResult.steps });

    const { baseOid, candidateOid } = resolveBaseCandidateOids(state);
    expect(baseOid).toBe(baseCommitOid);
    expect(candidateOid).toBe(candidateCommitOid);
  });
});
