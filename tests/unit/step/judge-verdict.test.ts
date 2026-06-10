/**
 * Unit tests for judge-verdict.ts pure functions.
 *
 * Covers:
 * - deriveJudgeVerdict: priority order and structural inconsistency prevention
 * - deriveRequestReviewVerdict: blocking finding detection
 * - collectVerdictAffectingFindings: severity + resolution filter
 */
import { describe, it, expect } from "vitest";
import {
  deriveJudgeVerdict,
  deriveRequestReviewVerdict,
  collectVerdictAffectingFindings,
  collectFixableFindings,
} from "../../../src/core/step/judge-verdict.js";
import type { Finding } from "../../../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "medium",
    resolution: "fixable",
    file: "src/foo.ts",
    title: "Test finding",
    rationale: "Test rationale",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveJudgeVerdict
// ---------------------------------------------------------------------------

describe("deriveJudgeVerdict", () => {
  it("returns escalation when ok=false regardless of findings", () => {
    expect(deriveJudgeVerdict([], false)).toBe("escalation");
    expect(
      deriveJudgeVerdict([makeFinding({ severity: "low" })], false),
    ).toBe("escalation");
    expect(
      deriveJudgeVerdict([makeFinding({ severity: "critical" })], false),
    ).toBe("escalation");
  });

  it("returns escalation when decision-needed finding is present (ok=true)", () => {
    const findings = [makeFinding({ resolution: "decision-needed", severity: "medium" })];
    expect(deriveJudgeVerdict(findings, true)).toBe("escalation");
  });

  it("returns escalation for decision-needed even with low severity", () => {
    const findings = [makeFinding({ severity: "low", resolution: "decision-needed" })];
    expect(deriveJudgeVerdict(findings, true)).toBe("escalation");
  });

  it("returns needs-fix when critical finding is present (ok=true, no decision-needed)", () => {
    const findings = [makeFinding({ severity: "critical", resolution: "fixable" })];
    expect(deriveJudgeVerdict(findings, true)).toBe("needs-fix");
  });

  it("returns needs-fix when high finding is present (ok=true, no decision-needed)", () => {
    const findings = [makeFinding({ severity: "high", resolution: "fixable" })];
    expect(deriveJudgeVerdict(findings, true)).toBe("needs-fix");
  });

  it("structural inconsistency: critical findings cannot produce approved verdict", () => {
    // Agent may have claimed approved=true but findings say critical — CLI derives needs-fix
    const findings = [makeFinding({ severity: "critical" })];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("needs-fix");
    expect(verdict).not.toBe("approved");
  });

  it("returns approved when findings are empty (ok=true)", () => {
    expect(deriveJudgeVerdict([], true)).toBe("approved");
  });

  it("returns approved when only low/medium findings (ok=true)", () => {
    const findings = [
      makeFinding({ severity: "medium", resolution: "fixable" }),
      makeFinding({ severity: "low", resolution: "fixable" }),
    ];
    expect(deriveJudgeVerdict(findings, true)).toBe("approved");
  });

  it("decision-needed takes priority over critical/high (→ escalation, not needs-fix)", () => {
    const findings = [
      makeFinding({ severity: "critical", resolution: "fixable" }),
      makeFinding({ severity: "medium", resolution: "decision-needed" }),
    ];
    expect(deriveJudgeVerdict(findings, true)).toBe("escalation");
  });

  it("ok=false takes priority over everything (→ escalation)", () => {
    const findings = [makeFinding({ severity: "low", resolution: "fixable" })];
    expect(deriveJudgeVerdict(findings, false)).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// deriveRequestReviewVerdict
// ---------------------------------------------------------------------------

describe("deriveRequestReviewVerdict", () => {
  it("returns needs-discussion when ok=false", () => {
    expect(deriveRequestReviewVerdict([], false)).toBe("needs-discussion");
  });

  it("returns needs-discussion when high finding is present (ok=true)", () => {
    const findings = [makeFinding({ severity: "high" })];
    expect(deriveRequestReviewVerdict(findings, true)).toBe("needs-discussion");
  });

  it("returns needs-discussion when critical finding is present", () => {
    const findings = [makeFinding({ severity: "critical" })];
    expect(deriveRequestReviewVerdict(findings, true)).toBe("needs-discussion");
  });

  it("returns needs-discussion when decision-needed finding is present", () => {
    const findings = [makeFinding({ severity: "medium", resolution: "decision-needed" })];
    expect(deriveRequestReviewVerdict(findings, true)).toBe("needs-discussion");
  });

  it("returns approve when no blocking findings (ok=true)", () => {
    expect(deriveRequestReviewVerdict([], true)).toBe("approve");
  });

  it("returns approve when only medium/low fixable findings", () => {
    const findings = [
      makeFinding({ severity: "medium", resolution: "fixable" }),
      makeFinding({ severity: "low", resolution: "fixable" }),
    ];
    expect(deriveRequestReviewVerdict(findings, true)).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// collectVerdictAffectingFindings
// ---------------------------------------------------------------------------

describe("collectVerdictAffectingFindings", () => {
  it("returns empty array for empty input", () => {
    expect(collectVerdictAffectingFindings([])).toEqual([]);
  });

  it("includes critical findings", () => {
    const f = makeFinding({ severity: "critical" });
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("includes high findings", () => {
    const f = makeFinding({ severity: "high" });
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("includes decision-needed regardless of severity", () => {
    const f = makeFinding({ severity: "low", resolution: "decision-needed" });
    expect(collectVerdictAffectingFindings([f])).toContain(f);
  });

  it("excludes medium fixable findings", () => {
    const f = makeFinding({ severity: "medium", resolution: "fixable" });
    expect(collectVerdictAffectingFindings([f])).not.toContain(f);
  });

  it("excludes low fixable findings", () => {
    const f = makeFinding({ severity: "low", resolution: "fixable" });
    expect(collectVerdictAffectingFindings([f])).not.toContain(f);
  });

  it("returns correct subset from mixed findings", () => {
    const critical = makeFinding({ severity: "critical" });
    const high = makeFinding({ severity: "high" });
    const medium = makeFinding({ severity: "medium", resolution: "fixable" });
    const decisionNeeded = makeFinding({ severity: "medium", resolution: "decision-needed" });
    const low = makeFinding({ severity: "low", resolution: "fixable" });

    const result = collectVerdictAffectingFindings([critical, high, medium, decisionNeeded, low]);
    expect(result).toContain(critical);
    expect(result).toContain(high);
    expect(result).toContain(decisionNeeded);
    expect(result).not.toContain(medium);
    expect(result).not.toContain(low);
  });
});

// ---------------------------------------------------------------------------
// collectFixableFindings
// ---------------------------------------------------------------------------

describe("collectFixableFindings", () => {
  it("returns empty array for empty input", () => {
    expect(collectFixableFindings([])).toEqual([]);
  });

  it("returns all findings when all are fixable", () => {
    const f1 = makeFinding({ severity: "low", resolution: "fixable" });
    const f2 = makeFinding({ severity: "medium", resolution: "fixable" });
    expect(collectFixableFindings([f1, f2])).toEqual([f1, f2]);
  });

  it("returns only fixable findings from mixed input", () => {
    const fixable = makeFinding({ severity: "medium", resolution: "fixable" });
    const decisionNeeded = makeFinding({ severity: "medium", resolution: "decision-needed" });
    const result = collectFixableFindings([fixable, decisionNeeded]);
    expect(result).toContain(fixable);
    expect(result).not.toContain(decisionNeeded);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when all are decision-needed", () => {
    const f1 = makeFinding({ severity: "low", resolution: "decision-needed" });
    const f2 = makeFinding({ severity: "medium", resolution: "decision-needed" });
    expect(collectFixableFindings([f1, f2])).toEqual([]);
  });
});
