/**
 * Tests for judge verdict derivation functions.
 *
 * Verifies that deriveJudgeVerdict and deriveRequestReviewVerdict behaviour is
 * unchanged by the prose-only changes in this change set (T-05 AC: derivation
 * tests pass without modification).
 */
import { describe, it, expect } from "vitest";
import {
  deriveJudgeVerdict,
  deriveRequestReviewVerdict,
  collectVerdictAffectingFindings,
  collectFixableFindings,
} from "../judge-verdict.js";
import type { Finding } from "../../../kernel/report-result.js";

function finding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
): Finding {
  return {
    severity,
    resolution,
    file: "src/example.ts",
    title: "test finding",
    rationale: "test",
  };
}

// ---------------------------------------------------------------------------
// deriveJudgeVerdict
// ---------------------------------------------------------------------------

describe("deriveJudgeVerdict", () => {
  it("returns escalation when ok=false regardless of findings", () => {
    expect(deriveJudgeVerdict([], false)).toBe("escalation");
    expect(deriveJudgeVerdict([finding("critical", "fixable")], false)).toBe("escalation");
  });

  it("returns escalation when any finding has decision-needed resolution", () => {
    expect(deriveJudgeVerdict([finding("low", "decision-needed")], true)).toBe("escalation");
    expect(deriveJudgeVerdict([finding("medium", "decision-needed")], true)).toBe("escalation");
    expect(deriveJudgeVerdict([finding("high", "decision-needed")], true)).toBe("escalation");
  });

  it("decision-needed takes priority over needs-fix (decision-needed ≥ 1 → escalation first)", () => {
    const findings = [
      finding("critical", "fixable"),
      finding("low", "decision-needed"),
    ];
    expect(deriveJudgeVerdict(findings, true)).toBe("escalation");
  });

  it("returns needs-fix when critical finding exists (no decision-needed)", () => {
    expect(deriveJudgeVerdict([finding("critical", "fixable")], true)).toBe("needs-fix");
  });

  it("returns needs-fix when high finding exists (no decision-needed)", () => {
    expect(deriveJudgeVerdict([finding("high", "fixable")], true)).toBe("needs-fix");
  });

  it("returns approved when only medium/low fixable findings exist", () => {
    const findings = [
      finding("medium", "fixable"),
      finding("low", "fixable"),
    ];
    expect(deriveJudgeVerdict(findings, true)).toBe("approved");
  });

  it("returns approved when findings array is empty", () => {
    expect(deriveJudgeVerdict([], true)).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// deriveRequestReviewVerdict
// ---------------------------------------------------------------------------

describe("deriveRequestReviewVerdict", () => {
  it("returns needs-discussion when ok=false", () => {
    expect(deriveRequestReviewVerdict([], false)).toBe("needs-discussion");
  });

  it("returns needs-discussion when any finding has decision-needed", () => {
    expect(deriveRequestReviewVerdict([finding("low", "decision-needed")], true)).toBe("needs-discussion");
    expect(deriveRequestReviewVerdict([finding("medium", "decision-needed")], true)).toBe("needs-discussion");
  });

  it("returns needs-discussion when critical finding exists", () => {
    expect(deriveRequestReviewVerdict([finding("critical", "fixable")], true)).toBe("needs-discussion");
  });

  it("returns needs-discussion when high finding exists", () => {
    expect(deriveRequestReviewVerdict([finding("high", "fixable")], true)).toBe("needs-discussion");
  });

  it("returns approve when only medium/low fixable findings exist", () => {
    const findings = [finding("medium", "fixable"), finding("low", "fixable")];
    expect(deriveRequestReviewVerdict(findings, true)).toBe("approve");
  });

  it("returns approve when findings array is empty", () => {
    expect(deriveRequestReviewVerdict([], true)).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// collectVerdictAffectingFindings
// ---------------------------------------------------------------------------

describe("collectVerdictAffectingFindings", () => {
  it("includes critical severity findings", () => {
    const f = finding("critical", "fixable");
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("includes high severity findings", () => {
    const f = finding("high", "fixable");
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("includes decision-needed findings regardless of severity", () => {
    const f = finding("low", "decision-needed");
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("excludes medium/low fixable findings", () => {
    const findings = [finding("medium", "fixable"), finding("low", "fixable")];
    expect(collectVerdictAffectingFindings(findings)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// collectFixableFindings
// ---------------------------------------------------------------------------

describe("collectFixableFindings", () => {
  it("returns only fixable findings", () => {
    const fixable = finding("medium", "fixable");
    const dn = finding("low", "decision-needed");
    const result = collectFixableFindings([fixable, dn]);
    expect(result).toContain(fixable);
    expect(result).not.toContain(dn);
  });

  it("returns empty array when no fixable findings", () => {
    expect(collectFixableFindings([finding("high", "decision-needed")])).toHaveLength(0);
  });
});
