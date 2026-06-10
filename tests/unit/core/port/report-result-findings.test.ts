/**
 * Unit tests for findings validation in report-result parse functions.
 *
 * Covers:
 * - parseJudgeReportInput: findings required when ok=true, optional when ok=false
 * - parseCodeReviewReportInput: same findings semantics
 * - parseRequestReviewReportInput: same findings semantics
 * - parseFindings: standalone validation
 */
import { describe, it, expect } from "vitest";
import {
  parseJudgeReportInput,
  parseCodeReviewReportInput,
  parseRequestReviewReportInput,
  parseFindings,
} from "../../../../src/core/port/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validFinding = {
  severity: "high",
  resolution: "fixable",
  file: "src/foo.ts",
  title: "Test finding",
  rationale: "Test rationale",
};

const validFindingWithLine = {
  ...validFinding,
  line: 42,
};

// ---------------------------------------------------------------------------
// parseFindings
// ---------------------------------------------------------------------------

describe("parseFindings", () => {
  it("empty array → ok:true, value:[]", () => {
    const result = parseFindings([]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toEqual([]);
  });

  it("valid finding array → ok:true with findings", () => {
    const result = parseFindings([validFinding]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.severity).toBe("high");
  });

  it("valid finding with optional line → preserved", () => {
    const result = parseFindings([validFindingWithLine]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.line).toBe(42);
  });

  it("non-array input → ok:false", () => {
    expect(parseFindings(null).ok).toBe(false);
    expect(parseFindings("string").ok).toBe(false);
    expect(parseFindings({}).ok).toBe(false);
    expect(parseFindings(undefined).ok).toBe(false);
  });

  it("invalid severity → ok:false", () => {
    const result = parseFindings([{ ...validFinding, severity: "bogus" }]);
    expect(result.ok).toBe(false);
  });

  it("invalid resolution → ok:false", () => {
    const result = parseFindings([{ ...validFinding, resolution: "maybe" }]);
    expect(result.ok).toBe(false);
  });

  it("missing file → ok:false", () => {
    const { file: _file, ...withoutFile } = validFinding;
    const result = parseFindings([withoutFile]);
    expect(result.ok).toBe(false);
  });

  it("missing title → ok:false", () => {
    const { title: _title, ...withoutTitle } = validFinding;
    const result = parseFindings([withoutTitle]);
    expect(result.ok).toBe(false);
  });

  it("missing rationale → ok:false", () => {
    const { rationale: _rationale, ...withoutRationale } = validFinding;
    const result = parseFindings([withoutRationale]);
    expect(result.ok).toBe(false);
  });

  it("non-number line → ok:false", () => {
    const result = parseFindings([{ ...validFinding, line: "not-a-number" }]);
    expect(result.ok).toBe(false);
  });

  it("null element → ok:false", () => {
    expect(parseFindings([null]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseJudgeReportInput — findings required when ok=true
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput — findings validation", () => {
  it("{ok:true, findings:[valid]} → ok:true with findings set", () => {
    const result = parseJudgeReportInput({ ok: true, findings: [validFinding] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings?.[0]?.severity).toBe("high");
  });

  it("{ok:true, findings:[]} → ok:true with empty findings", () => {
    const result = parseJudgeReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toEqual([]);
  });

  it("{ok:true} without findings → ok:false, missingFields:['findings']", () => {
    const result = parseJudgeReportInput({ ok: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings");
  });

  it("{ok:true, findings:[{severity:'bogus'}]} → ok:false, missingFields:['findings']", () => {
    const result = parseJudgeReportInput({
      ok: true,
      findings: [{ severity: "bogus", resolution: "fixable", file: "f.ts", title: "t", rationale: "r" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings");
  });

  it("{ok:false, reason:'...'} → ok:true (findings not required)", () => {
    const result = parseJudgeReportInput({ ok: false, reason: "cannot review" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(false);
    expect(result.value.findings).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCodeReviewReportInput — inherits findings validation from judge
// ---------------------------------------------------------------------------

describe("parseCodeReviewReportInput — findings validation", () => {
  it("{ok:true, findings:[valid]} → ok:true with findings", () => {
    const result = parseCodeReviewReportInput({ ok: true, findings: [validFinding] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toHaveLength(1);
  });

  it("{ok:true} without findings → ok:false, missingFields:['findings']", () => {
    const result = parseCodeReviewReportInput({ ok: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings");
  });

  it("{ok:false} → ok:true (findings not required)", () => {
    const result = parseCodeReviewReportInput({ ok: false, reason: "error" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(false);
  });

  it("fixableCount is preserved when present", () => {
    const result = parseCodeReviewReportInput({
      ok: true,
      findings: [validFinding],
      fixableCount: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.fixableCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseRequestReviewReportInput — findings required when ok=true
// ---------------------------------------------------------------------------

describe("parseRequestReviewReportInput — findings validation", () => {
  it("{ok:true, findings:[valid]} → ok:true with findings", () => {
    const result = parseRequestReviewReportInput({ ok: true, findings: [validFinding] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toHaveLength(1);
  });

  it("{ok:true, findings:[]} → ok:true with empty findings", () => {
    const result = parseRequestReviewReportInput({ ok: true, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toEqual([]);
  });

  it("{ok:true} without findings → ok:false, missingFields:['findings']", () => {
    const result = parseRequestReviewReportInput({ ok: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings");
  });

  it("{ok:false} → ok:true (findings not required)", () => {
    const result = parseRequestReviewReportInput({ ok: false, reason: "error" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(false);
    expect(result.value.findings).toBeUndefined();
  });

  it("verdict field is preserved when present (compat)", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      findings: [],
      verdict: "approve",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.verdict).toBe("approve");
  });
});
