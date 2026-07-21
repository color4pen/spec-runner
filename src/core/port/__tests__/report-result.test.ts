/**
 * Unit tests for parseFindings and parseObservations.
 * Covers line: null normalization and symmetry between the two parsers.
 */
import { describe, it, expect } from "vitest";
import { parseFindings, parseObservations, parseRequestReviewReportInput, parseJudgeReportInput } from "../../port/report-result.js";

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

// ---------------------------------------------------------------------------
// T-02: parseRequestReviewReportInput — findings optional when ok=true
//
// TC-024 fixture following: evidence: { checked: N>0, ... } added to all ok=true inputs.
// The primary assertion (findings optionality) is unchanged; evidence is added as a
// required companion field so these tests remain valid after the evidence enforcement lands.
// { ok: false } inputs are not changed (ok=false does not require evidence).
// ---------------------------------------------------------------------------

describe("parseRequestReviewReportInput — findings optional when ok=true (T-02)", () => {
  it("{ ok: true, evidence: {...} } (no findings field) → parse succeeds, findings undefined", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(true);
    expect(result.value.findings).toBeUndefined();
  });

  it("{ ok: true, verdict: 'approve', evidence: {...} } (no findings field) → parse succeeds, findings undefined", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, verdict: "approve", evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(true);
    expect(result.value.verdict).toBe("approve");
    expect(result.value.findings).toBeUndefined();
  });

  it("{ ok: true, findings: [], evidence: {...} } → parse succeeds, findings is empty array", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings).toEqual([]);
  });

  it("{ ok: true, findings: [invalid] } → parse fails (findings present but invalid — evidence check not reached)", () => {
    // Invalid findings cause parse failure before evidence is checked — no evidence needed
    const result = parseRequestReviewReportInput({
      ok: true,
      findings: [{ severity: "invalid", resolution: "fixable", file: "a.ts", title: "T", rationale: "R" }],
    });
    expect(result.ok).toBe(false);
  });

  it("{ ok: false } → parse succeeds (findings and evidence not required when ok=false)", () => {
    const result = parseRequestReviewReportInput({ ok: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(false);
  });

  it("parseJudgeReportInput { ok: true } (no findings) → parse FAILS (findings required for judge steps)", () => {
    const result = parseJudgeReportInput({ ok: true });
    expect(result.ok).toBe(false);
  });
});

describe("parseRequestReviewReportInput — findings routing (T-02 symptom 2)", () => {
  it("MEDIUM+LOW findings only + evidence → deriveRequestReviewVerdict produces 'approve'", async () => {
    const { deriveRequestReviewVerdict } = await import("../../step/judge-verdict.js");
    // TC-024: evidence added to satisfy the new evidence requirement
    const raw = {
      ok: true,
      verdict: "approve",
      findings: [
        { severity: "medium", resolution: "fixable", file: "a.ts", title: "T1", rationale: "R1" },
        { severity: "low", resolution: "fixable", file: "b.ts", title: "T2", rationale: "R2" },
      ],
      evidence: { checked: 2, skipped: 0, unverified: 0 },
    };
    const parsed = parseRequestReviewReportInput(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Cast to future signature (evidence as 3rd arg) for post-implementation verdict derivation
    type VerdictFn = (findings: unknown[], ok: boolean, evidence?: unknown) => "approve" | "needs-discussion";
    const verdictFn = deriveRequestReviewVerdict as unknown as VerdictFn;
    const value = parsed.value as unknown as { findings?: unknown[]; ok: boolean; evidence?: unknown };
    const verdict = verdictFn(value.findings ?? [], value.ok, value.evidence);
    expect(verdict).toBe("approve");
  });

  it("no findings (undefined) + evidence → deriveRequestReviewVerdict produces 'approve'", async () => {
    const { deriveRequestReviewVerdict } = await import("../../step/judge-verdict.js");
    // TC-024: evidence added to satisfy the new evidence requirement
    const parsed = parseRequestReviewReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    type VerdictFn = (findings: unknown[], ok: boolean, evidence?: unknown) => "approve" | "needs-discussion";
    const verdictFn = deriveRequestReviewVerdict as unknown as VerdictFn;
    const value = parsed.value as unknown as { findings?: unknown[]; ok: boolean; evidence?: unknown };
    const verdict = verdictFn(value.findings ?? [], value.ok, value.evidence);
    expect(verdict).toBe("approve");
  });
});
