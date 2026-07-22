/**
 * Unit tests for findings validation in report-result parse functions.
 *
 * Covers:
 * - parseJudgeReportInput: findings required when ok=true, optional when ok=false
 * - parseCodeReviewReportInput: same findings semantics
 * - parseRequestReviewReportInput: same findings semantics
 * - parseFindings: standalone validation + fixTarget capture
 * - parseConformanceReportInput: fixTarget capture for conformance step
 */
import { describe, it, expect } from "vitest";
import {
  parseJudgeReportInput,
  parseCodeReviewReportInput,
  parseRequestReviewReportInput,
  parseFindings,
  parseConformanceReportInput,
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

  // fixTarget capture tests (T-02)
  it("valid fixTarget 'spec-fixer' is captured", () => {
    const result = parseFindings([{ ...validFinding, fixTarget: "spec-fixer" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.fixTarget).toBe("spec-fixer");
  });

  it("valid fixTarget 'implementer' is captured", () => {
    const result = parseFindings([{ ...validFinding, fixTarget: "implementer" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.fixTarget).toBe("implementer");
  });

  it("valid fixTarget 'code-fixer' is captured", () => {
    const result = parseFindings([{ ...validFinding, fixTarget: "code-fixer" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.fixTarget).toBe("code-fixer");
  });

  it("invalid fixTarget value is ignored (undefined, not in missingFields)", () => {
    const result = parseFindings([{ ...validFinding, fixTarget: "bogus-target" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.fixTarget).toBeUndefined();
  });

  it("absent fixTarget stays undefined", () => {
    const result = parseFindings([validFinding]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.fixTarget).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseJudgeReportInput — findings required when ok=true
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput — findings validation", () => {
  it("{ok:true, findings:[valid]} → ok:true with findings set", () => {
    const result = parseJudgeReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [validFinding] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings?.[0]?.severity).toBe("high");
  });

  it("{ok:true, findings:[]} → ok:true with empty findings", () => {
    const result = parseJudgeReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
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
    const result = parseCodeReviewReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [validFinding] });
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
      evidence: { checked: 1, skipped: 0, unverified: 0 },
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
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, findings: [validFinding], evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toHaveLength(1);
  });

  it("{ok:true, findings:[]} → ok:true with empty findings", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, findings: [], evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toEqual([]);
  });

  it("{ok:true} without findings → ok:true, findings undefined (T-02: findings now optional for request-review)", () => {
    // T-02 fix: request-review agents sometimes omit findings when there are no issues.
    // Parse succeeds and findings is undefined (treated as empty array for verdict derivation).
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(true);
    expect(result.value.findings).toBeUndefined();
  });

  it("{ok:false} → ok:true (findings not required)", () => {
    const result = parseRequestReviewReportInput({ ok: false, reason: "error" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(false);
    expect(result.value.findings).toBeUndefined();
  });

  it("verdict field is preserved when present (compat)", () => {
    // TC-024: evidence added to satisfy the new evidence requirement
    const result = parseRequestReviewReportInput({
      ok: true,
      findings: [],
      verdict: "approve",
      evidence: { checked: 1, skipped: 0, unverified: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.verdict).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// parseFindings — strict mode (decision-needed options enforcement)
// ---------------------------------------------------------------------------

describe("parseFindings strict mode — decision-needed options enforcement", () => {
  const decisionNeededBase = {
    severity: "low" as const,
    resolution: "decision-needed" as const,
    file: "src/design.ts",
    title: "Human choice required",
    rationale: "Product owner must decide",
  };

  it("decision-needed with 2+ valid options → ok:true in strict mode", () => {
    const result = parseFindings(
      [
        {
          ...decisionNeededBase,
          options: [
            { label: "Option A", consequence: "Low risk" },
            { label: "Option B", consequence: "High risk" },
          ],
        },
      ],
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]?.options).toHaveLength(2);
  });

  it("decision-needed with 3 options → ok:true in strict mode", () => {
    const result = parseFindings(
      [
        {
          ...decisionNeededBase,
          options: [
            { label: "A", consequence: "C-A" },
            { label: "B", consequence: "C-B" },
            { label: "C", consequence: "C-C" },
          ],
        },
      ],
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("decision-needed without options → ok:false in strict mode", () => {
    const result = parseFindings([decisionNeededBase], true);
    expect(result.ok).toBe(false);
  });

  it("decision-needed with empty options array → ok:false in strict mode", () => {
    const result = parseFindings([{ ...decisionNeededBase, options: [] }], true);
    expect(result.ok).toBe(false);
  });

  it("decision-needed with one option → ok:false in strict mode (need ≥2)", () => {
    const result = parseFindings(
      [{ ...decisionNeededBase, options: [{ label: "Only option", consequence: "consequence" }] }],
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("decision-needed with malformed option (missing label) → ok:false in strict mode", () => {
    const result = parseFindings(
      [{ ...decisionNeededBase, options: [{ consequence: "no label" }, { label: "B", consequence: "C-B" }] }],
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("decision-needed with malformed option (missing consequence) → ok:false in strict mode", () => {
    const result = parseFindings(
      [{ ...decisionNeededBase, options: [{ label: "A" }, { label: "B", consequence: "C-B" }] }],
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("decision-needed with empty label → ok:false in strict mode", () => {
    const result = parseFindings(
      [
        {
          ...decisionNeededBase,
          options: [
            { label: "  ", consequence: "C-A" },
            { label: "B", consequence: "C-B" },
          ],
        },
      ],
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("decision-needed with empty consequence → ok:false in strict mode", () => {
    const result = parseFindings(
      [
        {
          ...decisionNeededBase,
          options: [
            { label: "A", consequence: "" },
            { label: "B", consequence: "C-B" },
          ],
        },
      ],
      true,
    );
    expect(result.ok).toBe(false);
  });

  it("fixable finding does not require options in strict mode", () => {
    const result = parseFindings([validFinding], true); // validFinding is resolution:"fixable"
    expect(result.ok).toBe(true);
  });

  it("decision-needed without options → ok:true in non-strict mode (backward compat)", () => {
    const result = parseFindings([decisionNeededBase]); // strict defaults to false
    expect(result.ok).toBe(true);
  });

  it("options field captured when present and valid", () => {
    const result = parseFindings(
      [
        {
          ...decisionNeededBase,
          options: [
            { label: "Opt A", consequence: "Consequence A" },
            { label: "Opt B", consequence: "Consequence B" },
          ],
        },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const f = result.value[0]!;
    expect(f.options).toHaveLength(2);
    expect(f.options![0]!.label).toBe("Opt A");
    expect(f.options![1]!.consequence).toBe("Consequence B");
  });
});

// ---------------------------------------------------------------------------
// parseConformanceReportInput — fixTarget capture (T-02)
// ---------------------------------------------------------------------------

describe("parseConformanceReportInput — fixTarget capture", () => {
  it("{ok:true, findings:[{fixTarget:'spec-fixer'}]} → finding has fixTarget", () => {
    const result = parseConformanceReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [{ ...validFinding, fixTarget: "spec-fixer" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings?.[0]?.fixTarget).toBe("spec-fixer");
  });

  it("invalid fixTarget is ignored (undefined on finding)", () => {
    const result = parseConformanceReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [{ ...validFinding, fixTarget: "bogus" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings?.[0]?.fixTarget).toBeUndefined();
  });

  it("{ok:true, findings:[]} → ok:true with empty findings", () => {
    const result = parseConformanceReportInput({ ok: true, evidence: { checked: 1, skipped: 0, unverified: 0 }, findings: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.findings).toEqual([]);
  });

  it("{ok:true} without findings → ok:false (findings required)", () => {
    const result = parseConformanceReportInput({ ok: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings");
  });

  it("{ok:false} → ok:true (findings not required)", () => {
    const result = parseConformanceReportInput({ ok: false, reason: "cannot review" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.ok).toBe(false);
  });
});
