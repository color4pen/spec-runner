/**
 * Schema round-trip tests for BiteEvidence (T-05).
 *
 * Verifies:
 *   - TC-019: JobState.biteEvidence round-trips through state.json via validateJobState
 *
 * Tests for non-must TC-020 and TC-021 are included as "should" coverage
 * but the must TC-019 is the primary focus.
 */

import { describe, it, expect } from "vitest";
import { validateJobState } from "../schema.js";
import type { BiteEvidenceRecord } from "../schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...overrides,
  };
}

const sampleBiteEvidenceRecord: BiteEvidenceRecord = {
  testId: "src/__tests__/foo.test.ts",
  strategy: "forward",
  baseResult: "red",
  candidateResult: "green",
  verified: true,
};

// ---------------------------------------------------------------------------
// TC-019: JobState.biteEvidence round-trips through state.json
// ---------------------------------------------------------------------------

describe("TC-019: JobState.biteEvidence round-trips through validateJobState", () => {
  it("TC-019: present biteEvidence is preserved through validateJobState", () => {
    const raw = makeMinimalRaw({
      biteEvidence: [sampleBiteEvidenceRecord],
    });

    const state = validateJobState(raw);
    const biteEvidence = (state as typeof state & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;

    expect(biteEvidence).toBeDefined();
    expect(biteEvidence).toHaveLength(1);
    expect(biteEvidence![0]!.testId).toBe("src/__tests__/foo.test.ts");
    expect(biteEvidence![0]!.strategy).toBe("forward");
    expect(biteEvidence![0]!.baseResult).toBe("red");
    expect(biteEvidence![0]!.candidateResult).toBe("green");
    expect(biteEvidence![0]!.verified).toBe(true);
  });

  it("TC-019: multiple BiteEvidence records are all preserved", () => {
    const records: BiteEvidenceRecord[] = [
      { testId: "src/__tests__/a.test.ts", strategy: "forward", baseResult: "red", candidateResult: "green", verified: true },
      { testId: "src/__tests__/b.test.ts", strategy: "forward", baseResult: "red", candidateResult: "green", verified: true },
    ];

    const raw = makeMinimalRaw({ biteEvidence: records });
    const state = validateJobState(raw);
    const biteEvidence = (state as typeof state & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;

    expect(biteEvidence).toHaveLength(2);
    expect(biteEvidence![0]!.testId).toBe("src/__tests__/a.test.ts");
    expect(biteEvidence![1]!.testId).toBe("src/__tests__/b.test.ts");
  });

  it("TC-019: absent biteEvidence is accepted without error (legacy state)", () => {
    const raw = makeMinimalRaw(); // no biteEvidence key
    expect(() => validateJobState(raw)).not.toThrow();

    const state = validateJobState(raw);
    const biteEvidence = (state as typeof state & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;
    expect(biteEvidence).toBeUndefined();
  });

  it("TC-019: round-trip through JSON.stringify preserves biteEvidence fields", () => {
    const raw = makeMinimalRaw({
      biteEvidence: [sampleBiteEvidenceRecord],
    });

    const state = validateJobState(raw);

    // Simulate state.json write + read
    const json = JSON.stringify(state);
    const reparsed = JSON.parse(json);
    const reloaded = validateJobState(reparsed);

    const biteEvidence = (reloaded as typeof reloaded & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;
    expect(biteEvidence).toHaveLength(1);
    expect(biteEvidence![0]).toMatchObject(sampleBiteEvidenceRecord);
  });

  it("TC-019: empty biteEvidence array is preserved", () => {
    const raw = makeMinimalRaw({ biteEvidence: [] });
    const state = validateJobState(raw);
    const biteEvidence = (state as typeof state & { biteEvidence?: BiteEvidenceRecord[] }).biteEvidence;

    expect(biteEvidence).toBeDefined();
    expect(biteEvidence).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Non-array biteEvidence rejection (TC-021 — "should" priority)
// ---------------------------------------------------------------------------

describe("validateJobState rejects non-array biteEvidence", () => {
  it("rejects biteEvidence that is not an array", () => {
    const raw = makeMinimalRaw({ biteEvidence: "not-an-array" });
    expect(() => validateJobState(raw)).toThrow(/biteEvidence/i);
  });
});
