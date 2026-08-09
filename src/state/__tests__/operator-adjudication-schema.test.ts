/**
 * Unit tests for appendOperatorAdjudication and validateJobState (operatorAdjudications field).
 *
 * Source: specrunner/changes/custom-reviewer-round-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * These tests FAIL until T-01 is implemented (RED phase).
 *
 * TC-026: appendOperatorAdjudication — 既存 state を変更せず新 state を返す (immutable) (must)
 * TC-027: appendOperatorAdjudication — operatorAdjudications 不在の state に 1 要素配列を作る (must)
 * TC-028: validateJobState — operatorAdjudications を含む state が round-trip する (must)
 * TC-029: validateJobState — 不正な operatorAdjudications で throw する (should)
 * TC-030: validateJobState — operatorAdjudications 不在の legacy state を受理する (backward compat) (should)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { validateJobState } from "../schema.js";

// ---------------------------------------------------------------------------
// Dynamic import for appendOperatorAdjudication (not yet implemented — RED phase)
// ---------------------------------------------------------------------------

type OperatorAdjudication = { text: string; step: string; recordedAt: string };
type AppendOperatorAdjudicationFn = (
  state: Record<string, unknown>,
  record: OperatorAdjudication,
) => Record<string, unknown>;

let appendOperatorAdjudication: AppendOperatorAdjudicationFn | undefined;

beforeAll(async () => {
  try {
    const mod = await import("../schema/operations.js") as Record<string, unknown>;
    appendOperatorAdjudication = mod["appendOperatorAdjudication"] as AppendOperatorAdjudicationFn | undefined;
  } catch {
    // Module exists but function not yet exported — each test will fail with a clear message
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    jobId: "operator-adj-test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "new-feature", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/t",
    history: [],
    error: null,
    ...overrides,
  };
}

const NOW = "2026-08-09T10:00:00.000Z";

// ---------------------------------------------------------------------------
// TC-026 (must): appendOperatorAdjudication — 既存 state を変更せず新 state を返す (immutable)
// ---------------------------------------------------------------------------

describe("TC-026: appendOperatorAdjudication — 既存 state を変更せず新 state を返す (immutable)", () => {
  it("TC-026: appendOperatorAdjudication is exported from operations.ts", () => {
    expect(appendOperatorAdjudication).toBeDefined();
  });

  it("TC-026: returned state has the new record appended (2 entries total)", () => {
    expect(appendOperatorAdjudication).toBeDefined();

    const existing: OperatorAdjudication = { text: "first", step: "sec", recordedAt: "2026-01-01T00:00:00Z" };
    const original = makeMinimalRaw({ operatorAdjudications: [existing] });

    const record: OperatorAdjudication = { text: "Y", step: "sec", recordedAt: NOW };
    const result = appendOperatorAdjudication!(original, record);

    const adjudications = result["operatorAdjudications"] as OperatorAdjudication[];
    expect(adjudications).toHaveLength(2);
    expect(adjudications[1]!.text).toBe("Y");
  });

  it("TC-026: original state is not mutated (immutability)", () => {
    expect(appendOperatorAdjudication).toBeDefined();

    const existing: OperatorAdjudication = { text: "first", step: "sec", recordedAt: "2026-01-01T00:00:00Z" };
    const original = makeMinimalRaw({ operatorAdjudications: [existing] });
    const originalAdj = original["operatorAdjudications"] as OperatorAdjudication[];

    const record: OperatorAdjudication = { text: "Y", step: "sec", recordedAt: NOW };
    appendOperatorAdjudication!(original, record);

    // Original must not be changed
    expect((original["operatorAdjudications"] as OperatorAdjudication[])).toHaveLength(1);
    expect(originalAdj).toHaveLength(1);
  });

  it("TC-026: result is a new object (not the same reference)", () => {
    expect(appendOperatorAdjudication).toBeDefined();

    const original = makeMinimalRaw({ operatorAdjudications: [] });
    const record: OperatorAdjudication = { text: "Y", step: "sec", recordedAt: NOW };
    const result = appendOperatorAdjudication!(original, record);

    expect(result).not.toBe(original);
  });
});

// ---------------------------------------------------------------------------
// TC-027 (must): appendOperatorAdjudication — operatorAdjudications 不在の state に 1 要素配列を作る
// ---------------------------------------------------------------------------

describe("TC-027: appendOperatorAdjudication — operatorAdjudications 不在の state に 1 要素配列を作る", () => {
  it("TC-027: creates [record] when operatorAdjudications is undefined (field absent)", () => {
    expect(appendOperatorAdjudication).toBeDefined();

    // No operatorAdjudications field at all
    const original = makeMinimalRaw();
    expect(original["operatorAdjudications"]).toBeUndefined();

    const record: OperatorAdjudication = { text: "first adjudication", step: "security", recordedAt: NOW };
    const result = appendOperatorAdjudication!(original, record);

    const adjudications = result["operatorAdjudications"] as OperatorAdjudication[];
    expect(Array.isArray(adjudications)).toBe(true);
    expect(adjudications).toHaveLength(1);
    expect(adjudications[0]!.text).toBe("first adjudication");
    expect(adjudications[0]!.step).toBe("security");
    expect(adjudications[0]!.recordedAt).toBe(NOW);
  });

  it("TC-027: record fields (text, step, recordedAt) are preserved exactly", () => {
    expect(appendOperatorAdjudication).toBeDefined();

    const original = makeMinimalRaw();
    const record: OperatorAdjudication = {
      text: "do not revert auth module",
      step: "custom-reviewer-security",
      recordedAt: "2026-08-09T10:30:00.000Z",
    };
    const result = appendOperatorAdjudication!(original, record);

    const adjudications = result["operatorAdjudications"] as OperatorAdjudication[];
    expect(adjudications[0]!.text).toBe("do not revert auth module");
    expect(adjudications[0]!.step).toBe("custom-reviewer-security");
    expect(adjudications[0]!.recordedAt).toBe("2026-08-09T10:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// TC-028 (must): validateJobState — operatorAdjudications を含む state が round-trip する
// ---------------------------------------------------------------------------

describe("TC-028: validateJobState — operatorAdjudications を含む state が round-trip する", () => {
  it("TC-028: does not throw and preserves operatorAdjudications through JSON round-trip", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [
        { text: "T", step: "s", recordedAt: "2026-01-01T00:00:00Z" },
      ],
    });

    // JSON round-trip
    const reparsed = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

    let state;
    expect(() => {
      state = validateJobState(reparsed);
    }).not.toThrow();

    const adj = (state as unknown as { operatorAdjudications?: OperatorAdjudication[] }).operatorAdjudications;
    expect(adj).toBeDefined();
    expect(Array.isArray(adj)).toBe(true);
    expect(adj!.length).toBe(1);
    expect(adj![0]!.text).toBe("T");
    expect(adj![0]!.step).toBe("s");
    expect(adj![0]!.recordedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("TC-028: validates state with multiple adjudication records without error", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [
        { text: "first", step: "security", recordedAt: "2026-01-01T00:00:00Z" },
        { text: "second", step: "perf", recordedAt: "2026-01-02T00:00:00Z" },
      ],
    });

    expect(() => validateJobState(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-029 (should): validateJobState — 不正な operatorAdjudications で throw する
// ---------------------------------------------------------------------------

describe("TC-029 (should): validateJobState — 不正な operatorAdjudications で throw する", () => {
  it("TC-029: throws when operatorAdjudications is a string (not an array)", () => {
    const raw = makeMinimalRaw({ operatorAdjudications: "not-an-array" });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-029: throws when an entry is missing the required 'text' field", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [{ step: "security", recordedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-029: throws when an entry is missing the required 'step' field", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [{ text: "T", recordedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-029: throws when an entry is missing the required 'recordedAt' field", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [{ text: "T", step: "security" }],
    });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("TC-029: throws when an entry has a non-string 'text' field", () => {
    const raw = makeMinimalRaw({
      operatorAdjudications: [{ text: 42, step: "security", recordedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(() => validateJobState(raw)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-030 (should): validateJobState — operatorAdjudications 不在の legacy state を受理する (backward compat)
// ---------------------------------------------------------------------------

describe("TC-030 (should): validateJobState — operatorAdjudications 不在の legacy state を受理する (backward compat)", () => {
  it("TC-030: does not throw when operatorAdjudications field is absent", () => {
    const raw = makeMinimalRaw(); // no operatorAdjudications field
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-030: does not throw when operatorAdjudications is an empty array", () => {
    const raw = makeMinimalRaw({ operatorAdjudications: [] });
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("TC-030: returns state with operatorAdjudications undefined when field is absent", () => {
    const raw = makeMinimalRaw();
    const state = validateJobState(raw);
    const adj = (state as unknown as { operatorAdjudications?: unknown }).operatorAdjudications;
    // Should be undefined or absent (not a crash)
    expect(adj === undefined || adj === null).toBe(true);
  });
});
