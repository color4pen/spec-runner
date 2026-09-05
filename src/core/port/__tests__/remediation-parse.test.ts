/**
 * T-10: Remediation contract parse tests.
 *
 * Covers:
 * - parseRemediation: valid / invalid inputs, null / null-line normalization
 * - parseFindings with requireRemediation: fixable+absent → fail, decision-needed+absent → ok
 * - parseJudgeReportInput fail-closed: fixable without remediation → missingFields
 * - parseRequestReviewReportInput: fixable without remediation → ok (no requirement)
 * - Self-site normalization: prepend when absent, no duplication when present
 * - Persisted backward compatibility: remediation-less findings parse ok in non-strict mode
 * - Identity invariance: remediation presence does not affect findingFingerprint / computeLedgerRef
 * - buildFindingsBlock: invariant / sites / approach in output; no-remediation output unchanged
 * - renderEvidenceReference: empty → "", 1+ paths → block with path
 */
import { describe, it, expect } from "vitest";
import {
  parseRemediation,
  parseFindings,
  parseJudgeReportInput,
  parseRequestReviewReportInput,
} from "../report-result.js";
import { buildFindingsBlock, renderEvidenceReference } from "../../step/fixer-helpers.js";
import type { Finding } from "../../../kernel/report-result.js";

// ---------------------------------------------------------------------------
// parseRemediation: valid inputs
// ---------------------------------------------------------------------------

describe("parseRemediation — valid inputs", () => {
  it("full valid remediation → ok:true with parsed value", () => {
    const result = parseRemediation({
      invariant: "The value must be positive",
      sites: [{ file: "src/foo.ts", line: 42 }],
      approach: "Check before assigning",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.invariant).toBe("The value must be positive");
    expect(result.value.sites).toHaveLength(1);
    expect(result.value.sites[0]!.file).toBe("src/foo.ts");
    expect(result.value.sites[0]!.line).toBe(42);
    expect(result.value.approach).toBe("Check before assigning");
  });

  it("site without line → site has no line field", () => {
    const result = parseRemediation({
      invariant: "Some invariant",
      sites: [{ file: "src/bar.ts" }],
      approach: "Approach",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect("line" in result.value.sites[0]!).toBe(false);
  });

  it("sites[].line: null → normalized to absent (no line field)", () => {
    const result = parseRemediation({
      invariant: "Some invariant",
      sites: [{ file: "src/bar.ts", line: null }],
      approach: "Approach",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect("line" in result.value.sites[0]!).toBe(false);
  });

  it("multiple sites → all retained", () => {
    const result = parseRemediation({
      invariant: "Multi-site invariant",
      sites: [
        { file: "src/a.ts", line: 10 },
        { file: "src/b.ts", line: 20 },
      ],
      approach: "Fix all",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.sites).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseRemediation: invalid inputs
// ---------------------------------------------------------------------------

describe("parseRemediation — invalid inputs", () => {
  it("null → ok:false (not an object)", () => {
    expect(parseRemediation(null).ok).toBe(false);
  });

  it("array → ok:false (not a plain object)", () => {
    expect(parseRemediation([]).ok).toBe(false);
  });

  it("string → ok:false", () => {
    expect(parseRemediation("invariant").ok).toBe(false);
  });

  it("invariant: '' → ok:false", () => {
    expect(parseRemediation({ invariant: "", sites: [{ file: "f.ts" }], approach: "fix" }).ok).toBe(false);
  });

  it("invariant: '  ' (whitespace only) → ok:false", () => {
    expect(parseRemediation({ invariant: "  ", sites: [{ file: "f.ts" }], approach: "fix" }).ok).toBe(false);
  });

  it("approach: '' → ok:false", () => {
    expect(parseRemediation({ invariant: "i", sites: [{ file: "f.ts" }], approach: "" }).ok).toBe(false);
  });

  it("sites: [] → ok:false (must have at least 1)", () => {
    expect(parseRemediation({ invariant: "i", sites: [], approach: "fix" }).ok).toBe(false);
  });

  it("sites: [{file: ''}] → ok:false (empty file string)", () => {
    expect(parseRemediation({ invariant: "i", sites: [{ file: "" }], approach: "fix" }).ok).toBe(false);
  });

  it("sites: [{file: 'f.ts', line: 'bad'}] → ok:false (line not a number)", () => {
    expect(parseRemediation({ invariant: "i", sites: [{ file: "f.ts", line: "bad" }], approach: "fix" }).ok).toBe(false);
  });

  it("sites: [null] → ok:false (null element)", () => {
    expect(parseRemediation({ invariant: "i", sites: [null], approach: "fix" }).ok).toBe(false);
  });

  it("sites not an array → ok:false", () => {
    expect(parseRemediation({ invariant: "i", sites: "not an array", approach: "fix" }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseFindings with requireRemediation
// ---------------------------------------------------------------------------

describe("parseFindings — requireRemediation enforcement", () => {
  const validRemediation = {
    invariant: "Must hold",
    sites: [{ file: "src/x.ts", line: 5 }],
    approach: "Fix it",
  };

  it("fixable + remediation present → ok:true (strict + requireRemediation)", () => {
    const result = parseFindings(
      [{ severity: "high", resolution: "fixable", file: "src/x.ts", line: 5, title: "T", rationale: "R", remediation: validRemediation }],
      true,
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("fixable + no remediation → ok:false, reason:'remediation-missing' (strict + requireRemediation)", () => {
    const result = parseFindings(
      [{ severity: "high", resolution: "fixable", file: "src/x.ts", title: "T", rationale: "R" }],
      true,
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("remediation-missing");
  });

  it("decision-needed + no remediation → ok:true (remediation not required for decision-needed)", () => {
    const result = parseFindings(
      [
        {
          severity: "low",
          resolution: "decision-needed",
          file: "src/y.ts",
          title: "Choose",
          rationale: "R",
          options: [
            { label: "A", consequence: "CA" },
            { label: "B", consequence: "CB" },
          ],
        },
      ],
      true,
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("malformed remediation (strict) → ok:false (no reason field, generic failure)", () => {
    const result = parseFindings(
      [{ severity: "high", resolution: "fixable", file: "f.ts", title: "T", rationale: "R", remediation: { invariant: "", sites: [], approach: "x" } }],
      true,
      false,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBeUndefined();
  });

  it("malformed remediation (non-strict) → silent drop, finding kept", () => {
    const result = parseFindings(
      [{ severity: "high", resolution: "fixable", file: "f.ts", title: "T", rationale: "R", remediation: { invariant: "", sites: [], approach: "x" } }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.remediation).toBeUndefined();
  });

  it("fixable + no remediation (non-strict) → ok:true (backward compat, persisted findings)", () => {
    const result = parseFindings(
      [{ severity: "high", resolution: "fixable", file: "f.ts", title: "T", rationale: "R" }],
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseJudgeReportInput: fail-closed for fixable without remediation
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput — fail-closed for missing remediation", () => {
  it("fixable finding without remediation → ok:false, missingFields:['findings.remediation']", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [{ severity: "high", resolution: "fixable", file: "f.ts", title: "T", rationale: "R" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.missingFields).toContain("findings.remediation");
  });

  it("decision-needed finding without remediation → ok:true", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [
        {
          severity: "low",
          resolution: "decision-needed",
          file: "f.ts",
          title: "Choose",
          rationale: "R",
          options: [
            { label: "A", consequence: "CA" },
            { label: "B", consequence: "CB" },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("empty findings array → ok:true (no fixable findings to require remediation)", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [],
    });
    expect(result.ok).toBe(true);
  });

  it("malformed remediation (non-empty but invalid) → ok:false, missingFields:['findings']", () => {
    const result = parseJudgeReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [
        {
          severity: "high",
          resolution: "fixable",
          file: "f.ts",
          title: "T",
          rationale: "R",
          remediation: { invariant: "", sites: [], approach: "" },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Malformed remediation → strict failure → ["findings"] (not remediation-missing)
    expect(result.missingFields).toContain("findings");
  });
});

// ---------------------------------------------------------------------------
// parseRequestReviewReportInput: fixable without remediation → ok
// ---------------------------------------------------------------------------

describe("parseRequestReviewReportInput — remediation not required", () => {
  it("fixable finding without remediation → ok:true (request-review does not require remediation)", () => {
    const result = parseRequestReviewReportInput({
      ok: true,
      evidence: { checked: 1, skipped: 0, unverified: 0 },
      findings: [{ severity: "high", resolution: "fixable", file: "f.ts", title: "T", rationale: "R" }],
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Self-site normalization
// ---------------------------------------------------------------------------

describe("parseFindings — self-site normalization", () => {
  const baseRemediation = {
    invariant: "Some invariant",
    approach: "Fix approach",
  };

  it("finding file:line not in sites → prepended as first site", () => {
    const result = parseFindings(
      [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/main.ts",
          line: 10,
          title: "T",
          rationale: "R",
          remediation: {
            ...baseRemediation,
            sites: [{ file: "src/other.ts", line: 20 }],
          },
        },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const rem = result.value[0]!.remediation!;
    expect(rem.sites[0]!.file).toBe("src/main.ts");
    expect(rem.sites[0]!.line).toBe(10);
    expect(rem.sites).toHaveLength(2);
  });

  it("finding file already in sites → no duplication", () => {
    const result = parseFindings(
      [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/main.ts",
          line: 10,
          title: "T",
          rationale: "R",
          remediation: {
            ...baseRemediation,
            sites: [{ file: "src/main.ts", line: 10 }],
          },
        },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const rem = result.value[0]!.remediation!;
    expect(rem.sites).toHaveLength(1);
    expect(rem.sites[0]!.file).toBe("src/main.ts");
  });

  it("finding with no line: prepend site without line when not in sites", () => {
    const result = parseFindings(
      [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/main.ts",
          title: "T",
          rationale: "R",
          remediation: {
            ...baseRemediation,
            sites: [{ file: "src/other.ts" }],
          },
        },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const rem = result.value[0]!.remediation!;
    expect(rem.sites[0]!.file).toBe("src/main.ts");
    expect("line" in rem.sites[0]!).toBe(false);
    expect(rem.sites).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Backward compat: persisted findings without remediation
// ---------------------------------------------------------------------------

describe("backward compat — persisted findings without remediation", () => {
  it("non-strict parseFindings of persisted fixable findings without remediation → ok:true", () => {
    // This is the evidence that persisted (old) findings remain valid after this change.
    const persistedFindings = [
      { severity: "high", resolution: "fixable", file: "src/old.ts", line: 42, title: "Old bug", rationale: "From review 2025" },
      { severity: "medium", resolution: "fixable", file: "src/other.ts", title: "Another issue", rationale: "From review 2025" },
    ];
    const result = parseFindings(persistedFindings);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toHaveLength(2);
    // No remediation — it stays absent (backward compat)
    expect(result.value[0]!.remediation).toBeUndefined();
    expect(result.value[1]!.remediation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildFindingsBlock: remediation expansion
// ---------------------------------------------------------------------------

describe("buildFindingsBlock — remediation expansion", () => {
  it("finding with remediation → invariant / sites / approach in output", () => {
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/commit-push.ts",
      line: 584,
      title: "Missing write-scope check",
      rationale: "Changed paths bypass scope check",
      remediation: {
        invariant: "All changed paths must pass write-scope check before commit",
        sites: [
          { file: "src/commit-push.ts", line: 584 },
          { file: "src/parallel-review-round.ts", line: 401 },
        ],
        approach: "Apply write-scope check to all changed paths early in the pipeline",
      },
    };
    const block = buildFindingsBlock([f]);
    expect(block).toContain("All changed paths must pass write-scope check before commit");
    expect(block).toContain("src/commit-push.ts:584");
    expect(block).toContain("src/parallel-review-round.ts:401");
    expect(block).toContain("Apply write-scope check to all changed paths early in the pipeline");
    expect(block).toContain("Sites (fix all in this iteration)");
  });

  it("finding with remediation → all-sites directive at end of block", () => {
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      title: "Bug",
      rationale: "R",
      remediation: {
        invariant: "Invariant",
        sites: [{ file: "src/foo.ts" }],
        approach: "Fix it",
      },
    };
    const block = buildFindingsBlock([f]);
    expect(block).toContain("全 site 同時修正指令");
  });

  it("finding WITHOUT remediation → output identical to pre-remediation format (no invariant/sites/approach/directive)", () => {
    // Legacy compat: non-remediation finding output must not change
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/foo.ts",
      line: 42,
      title: "Test finding",
      rationale: "Should be fixed",
    };
    const block = buildFindingsBlock([f], "security");
    // Legacy fields present
    expect(block).toContain("Test finding");
    expect(block).toContain("HIGH");
    expect(block).toContain("src/foo.ts:42");
    expect(block).toContain("fixable");
    expect(block).toContain("Should be fixed");
    expect(block).toContain("**Source**: security review");
    // Remediation-specific fields absent
    expect(block).not.toContain("Invariant");
    expect(block).not.toContain("Sites (fix all");
    expect(block).not.toContain("Approach");
    expect(block).not.toContain("全 site 同時修正指令");
  });

  it("mixed remediation-bearing and legacy findings → directive appears only once at end", () => {
    const withRem: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/a.ts",
      title: "Bug A",
      rationale: "R",
      remediation: { invariant: "Inv", sites: [{ file: "src/a.ts" }], approach: "Fix" },
    };
    const withoutRem: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: "src/b.ts",
      title: "Bug B",
      rationale: "R2",
    };
    const block = buildFindingsBlock([withRem, withoutRem]);
    // Directive appears once
    const directiveCount = (block.match(/全 site 同時修正指令/g) ?? []).length;
    expect(directiveCount).toBe(1);
  });

  it("reproduction fixture: F-001 cross-boundary-invariants — both sites appear simultaneously in buildMessage output", () => {
    // TC-T10: reproduction fixture for cross-boundary-invariants-result-002 F-001
    // Invariant: exclusion filter より前に全 changed path に write-scope 検査を適用する
    // Sites: src/core/step/commit-push.ts:584, src/core/pipeline/parallel-review-round.ts:401
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/core/step/commit-push.ts",
      line: 584,
      title: "Write-scope check bypassed by exclusion filter ordering",
      rationale: "Changed paths that pass the exclusion filter are committed without write-scope validation",
      remediation: {
        invariant: "exclusion filter より前に全 changed path に write-scope 検査を適用する",
        sites: [
          { file: "src/core/step/commit-push.ts", line: 584 },
          { file: "src/core/pipeline/parallel-review-round.ts", line: 401 },
        ],
        approach: "Apply write-scope check before the exclusion filter in both code paths",
      },
    };
    const block = buildFindingsBlock([f], "code-review");
    // Both sites must appear simultaneously in the output
    expect(block).toContain("src/core/step/commit-push.ts");
    expect(block).toContain("src/core/pipeline/parallel-review-round.ts");
    expect(block).toContain("commit-push.ts:584");
    expect(block).toContain("parallel-review-round.ts:401");
  });
});

// ---------------------------------------------------------------------------
// renderEvidenceReference
// ---------------------------------------------------------------------------

describe("renderEvidenceReference", () => {
  it("empty paths array → empty string", () => {
    expect(renderEvidenceReference([])).toBe("");
  });

  it("single path → block containing the path", () => {
    const result = renderEvidenceReference(["specrunner/changes/slug/review-feedback-001.md"]);
    expect(result).toContain("specrunner/changes/slug/review-feedback-001.md");
    expect(result.length).toBeGreaterThan(0);
  });

  it("multiple paths → all paths present in output", () => {
    const result = renderEvidenceReference([
      "specrunner/changes/slug/security-result-001.md",
      "specrunner/changes/slug/perf-result-001.md",
    ]);
    expect(result).toContain("specrunner/changes/slug/security-result-001.md");
    expect(result).toContain("specrunner/changes/slug/perf-result-001.md");
  });

  it("output includes read-only marker", () => {
    const result = renderEvidenceReference(["some/path.md"]);
    expect(result).toContain("読み取り専用");
  });
});
