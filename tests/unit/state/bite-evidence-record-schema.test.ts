/**
 * Unit tests for the extended BiteEvidenceRecord schema (assurance-provenance-floor T-02).
 *
 * Tests that BiteEvidenceRecord accepts the new optional fields (baseOid, candidateOid,
 * testHash) and that schema validation enforces type constraints while remaining
 * backward compatible with records lacking these fields.
 *
 * TC-017: baseOid / candidateOid / testHash を持つ BiteEvidenceRecord が validation を通り round-trip する
 * TC-018: 旧形式（OID / testHash フィールド欠落）BiteEvidenceRecord が valid のまま読める（後方互換）
 * TC-022: BiteEvidenceRecord の新フィールドに非 string 値が入ると validation がエラーを返す
 */
import { describe, it, expect } from "vitest";
import { validateJobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid JobState raw object for testing biteEvidence. */
function makeRawJobState(biteEvidence: unknown[]): Record<string, unknown> {
  return {
    version: 2,
    jobId: "00000000-0000-0000-0000-000000000099",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/repo/specrunner/changes/test/request.md",
      title: "Test",
      type: "spec-change",
      slug: "test",
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "change/test-abc12345",
    history: [],
    error: null,
    biteEvidence,
  };
}

/** A minimal valid "legacy" BiteEvidenceRecord (5 original fields only). */
const LEGACY_RECORD = {
  testId: "tests/unit/foo.test.ts",
  strategy: "forward",
  baseResult: "red",
  candidateResult: "green",
  verified: true,
};

/** A full BiteEvidenceRecord with all new fields. */
const FULL_RECORD = {
  testId: "tests/unit/foo.test.ts",
  strategy: "forward",
  baseResult: "red",
  candidateResult: "green",
  verified: true,
  baseOid: "base-commit-sha-0000000000001",
  candidateOid: "candidate-commit-sha-0000001",
  testHash: "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
};

// ---------------------------------------------------------------------------
// TC-018: 旧形式（フィールド欠落）BiteEvidenceRecord が valid のまま読める（後方互換）
// ---------------------------------------------------------------------------

describe("TC-018: 旧形式（OID / testHash フィールド欠落）BiteEvidenceRecord が valid のまま読める（後方互換）", () => {
  it("TC-018: legacy record with 5 original fields passes validateJobState", () => {
    const raw = makeRawJobState([LEGACY_RECORD]);
    // Must not throw — backward compat requires that records without new fields remain valid
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-018: multiple legacy records all pass validation", () => {
    const raw = makeRawJobState([
      LEGACY_RECORD,
      { ...LEGACY_RECORD, testId: "tests/unit/bar.test.ts", verified: false, candidateResult: "red" },
    ]);
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-018: legacy record is returned with original fields intact after validation", () => {
    const raw = makeRawJobState([LEGACY_RECORD]);
    const validated = validateJobState(raw);
    const records = validated.biteEvidence;
    expect(records).toBeDefined();
    expect(records).toHaveLength(1);
    const record = records![0]!;
    expect(record.testId).toBe("tests/unit/foo.test.ts");
    expect(record.strategy).toBe("forward");
    expect(record.baseResult).toBe("red");
    expect(record.candidateResult).toBe("green");
    expect(record.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-017: baseOid / candidateOid / testHash を持つ BiteEvidenceRecord が validation を通り round-trip する
// ---------------------------------------------------------------------------

describe("TC-017: baseOid / candidateOid / testHash を持つ BiteEvidenceRecord が validation を通り round-trip する", () => {
  it("TC-017: full record with all new fields passes validateJobState", () => {
    const raw = makeRawJobState([FULL_RECORD]);
    // Must not throw — new fields must be accepted
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-017: full record round-trips — all fields preserved after validation", () => {
    const raw = makeRawJobState([FULL_RECORD]);
    const validated = validateJobState(raw);
    const records = validated.biteEvidence;
    expect(records).toBeDefined();
    expect(records).toHaveLength(1);
    const record = records![0]! as typeof FULL_RECORD;

    // Original 5 fields
    expect(record.testId).toBe(FULL_RECORD.testId);
    expect(record.strategy).toBe(FULL_RECORD.strategy);
    expect(record.baseResult).toBe(FULL_RECORD.baseResult);
    expect(record.candidateResult).toBe(FULL_RECORD.candidateResult);
    expect(record.verified).toBe(FULL_RECORD.verified);

    // New fields (TC-017: these must survive round-trip)
    expect((record as Record<string, unknown>)["baseOid"]).toBe(FULL_RECORD.baseOid);
    expect((record as Record<string, unknown>)["candidateOid"]).toBe(FULL_RECORD.candidateOid);
    expect((record as Record<string, unknown>)["testHash"]).toBe(FULL_RECORD.testHash);
  });

  it("TC-017: record with only baseOid (no candidateOid or testHash) is valid", () => {
    const partialRecord = {
      ...LEGACY_RECORD,
      baseOid: "base-commit-sha-0000000000001",
    };
    const raw = makeRawJobState([partialRecord]);
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-017: record with only testHash (no OIDs) is valid", () => {
    const partialRecord = {
      ...LEGACY_RECORD,
      testHash: "sha256:abc123def456",
    };
    const raw = makeRawJobState([partialRecord]);
    expect(() => validateJobState(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-022: BiteEvidenceRecord の新フィールドに非 string 値が入ると validation がエラーを返す
// ---------------------------------------------------------------------------

describe("TC-022: BiteEvidenceRecord の新フィールドに非 string 値が入ると validation がエラーを返す", () => {
  it("TC-022: baseOid set to number → validation error (baseOid must be string)", () => {
    const invalidRecord = {
      ...LEGACY_RECORD,
      baseOid: 123, // must be string
    };
    const raw = makeRawJobState([invalidRecord]);
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-022: candidateOid set to boolean → validation error", () => {
    const invalidRecord = {
      ...LEGACY_RECORD,
      candidateOid: true, // must be string
    };
    const raw = makeRawJobState([invalidRecord]);
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-022: testHash set to null → validation error (null is not a string)", () => {
    const invalidRecord = {
      ...LEGACY_RECORD,
      testHash: null, // must be string or absent; null is invalid
    };
    const raw = makeRawJobState([invalidRecord]);
    expect(() => validateJobState(raw)).toThrow();
  });
});
