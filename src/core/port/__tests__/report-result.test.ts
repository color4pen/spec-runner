/**
 * Unit tests for parseFindings and parseObservations.
 * Covers line: null normalization and symmetry between the two parsers.
 */
import { describe, it, expect } from "vitest";
import { parseFindings, parseObservations } from "../../port/report-result.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BASE_FINDING = {
  severity: "high",
  resolution: "fixable",
  file: "a.ts",
  title: "T",
  rationale: "R",
};

const BASE_OBSERVATION = {
  severity: "high",
  file: "a.ts",
  title: "T",
  rationale: "R",
};

// ---------------------------------------------------------------------------
// parseFindings
// ---------------------------------------------------------------------------

describe("parseFindings", () => {
  it("line: null in a single finding → ok:true, finding retained, no line field", () => {
    const result = parseFindings([{ ...BASE_FINDING, line: null }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect("line" in result.value[0]!).toBe(false);
  });

  it("line: null in one of multiple findings → all findings retained", () => {
    const result = parseFindings([
      { ...BASE_FINDING, line: null },
      { ...BASE_FINDING, line: 5 },
      { ...BASE_FINDING },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect("line" in result.value[0]!).toBe(false);
    expect(result.value[1]!.line).toBe(5);
    expect("line" in result.value[2]!).toBe(false);
  });

  it("line: 'string' → ok:false (still rejected)", () => {
    const result = parseFindings([{ ...BASE_FINDING, line: "bad" }]);
    expect(result.ok).toBe(false);
  });

  it("line: 5 → ok:true, finding has line: 5", () => {
    const result = parseFindings([{ ...BASE_FINDING, line: 5 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.line).toBe(5);
  });

  it("no line field at all → ok:true, no line field on finding", () => {
    const result = parseFindings([{ ...BASE_FINDING }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("line" in result.value[0]!).toBe(false);
  });

  it("line: undefined → ok:true, no line field on finding", () => {
    const result = parseFindings([{ ...BASE_FINDING, line: undefined }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("line" in result.value[0]!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseObservations
// ---------------------------------------------------------------------------

describe("parseObservations", () => {
  it("line: null in a single observation → ok:true, observation retained, no line field", () => {
    const result = parseObservations([{ ...BASE_OBSERVATION, line: null }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect("line" in result.value[0]!).toBe(false);
  });

  it("line: null in one of multiple observations → all observations retained", () => {
    const result = parseObservations([
      { ...BASE_OBSERVATION, line: null },
      { ...BASE_OBSERVATION, line: 3 },
      { ...BASE_OBSERVATION },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect("line" in result.value[0]!).toBe(false);
    expect(result.value[1]!.line).toBe(3);
    expect("line" in result.value[2]!).toBe(false);
  });

  it("line: 'string' → ok:false (rejected)", () => {
    const result = parseObservations([{ ...BASE_OBSERVATION, line: "bad" }]);
    expect(result.ok).toBe(false);
  });

  it("line: 3 → ok:true, observation has line: 3", () => {
    const result = parseObservations([{ ...BASE_OBSERVATION, line: 3 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.line).toBe(3);
  });

  it("no line field at all → ok:true, no line field on observation", () => {
    const result = parseObservations([{ ...BASE_OBSERVATION }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("line" in result.value[0]!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Symmetry: parseFindings vs parseObservations
// ---------------------------------------------------------------------------

describe("symmetry: parseFindings vs parseObservations", () => {
  const lineValues = [
    { label: "null", value: null, expectOk: true },
    { label: "number (5)", value: 5, expectOk: true },
    { label: "absent", value: undefined, expectOk: true },
    { label: "string", value: "bad", expectOk: false },
    { label: "boolean", value: true, expectOk: false },
    { label: "object", value: {}, expectOk: false },
  ];

  for (const { label, value, expectOk } of lineValues) {
    it(`line: ${label} → both parseFindings and parseObservations return ok:${expectOk}`, () => {
      const findingInput = value === undefined
        ? [{ ...BASE_FINDING }]
        : [{ ...BASE_FINDING, line: value }];
      const observationInput = value === undefined
        ? [{ ...BASE_OBSERVATION }]
        : [{ ...BASE_OBSERVATION, line: value }];

      const findingResult = parseFindings(findingInput);
      const observationResult = parseObservations(observationInput);

      expect(findingResult.ok).toBe(expectOk);
      expect(observationResult.ok).toBe(expectOk);
    });
  }
});
