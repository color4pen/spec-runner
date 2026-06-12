/**
 * Unit tests for conformance verdict derivation (T-03)
 *
 * TC-JVCONF-01: deriveConformanceVerdict — 3-direction routing
 * TC-JVCONF-02: deriveConformanceVerdict — fixTarget omitted defaults to implementer
 * TC-JVCONF-03: deriveConformanceVerdict — priority: spec-fixer > implementer > code-fixer
 * TC-JVCONF-04: deriveConformanceVerdict — ok=false → escalation
 * TC-JVCONF-05: deriveConformanceVerdict — decision-needed → escalation
 * TC-JVCONF-06: deriveConformanceVerdict — no critical/high findings → approved
 * TC-JVCONF-07: aggregateFixTarget — single target values
 * TC-JVCONF-08: aggregateFixTarget — mixed targets (priority)
 * TC-JVCONF-09: aggregateFixTarget — all omitted defaults to implementer
 */
import { describe, it, expect } from "vitest";
import { deriveConformanceVerdict, aggregateFixTarget } from "../../../../src/core/step/judge-verdict.js";
import type { Finding } from "../../../../src/kernel/report-result.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    title: "Test finding",
    rationale: "Fix it",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-JVCONF-01: 3-direction routing
// ---------------------------------------------------------------------------
describe("TC-JVCONF-01: deriveConformanceVerdict — 3-direction routing", () => {
  it("high finding with fixTarget:spec-fixer → needs-fix:spec-fixer", () => {
    const findings: Finding[] = [makeFinding({ fixTarget: "spec-fixer" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:spec-fixer");
  });

  it("high finding with fixTarget:implementer → needs-fix:implementer", () => {
    const findings: Finding[] = [makeFinding({ fixTarget: "implementer" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:implementer");
  });

  it("high finding with fixTarget:code-fixer → needs-fix:code-fixer", () => {
    const findings: Finding[] = [makeFinding({ fixTarget: "code-fixer" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:code-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-02: fixTarget omitted defaults to implementer
// ---------------------------------------------------------------------------
describe("TC-JVCONF-02: deriveConformanceVerdict — fixTarget omitted → needs-fix:implementer", () => {
  it("high finding with no fixTarget → needs-fix:implementer", () => {
    const findings: Finding[] = [makeFinding()]; // no fixTarget
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:implementer");
  });

  it("critical finding with no fixTarget → needs-fix:implementer", () => {
    const findings: Finding[] = [makeFinding({ severity: "critical" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-03: mixed fixTargets use priority: spec-fixer > implementer > code-fixer
// ---------------------------------------------------------------------------
describe("TC-JVCONF-03: deriveConformanceVerdict — priority spec-fixer > implementer > code-fixer", () => {
  it("spec-fixer + implementer → spec-fixer wins", () => {
    const findings: Finding[] = [
      makeFinding({ fixTarget: "implementer" }),
      makeFinding({ fixTarget: "spec-fixer" }),
    ];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:spec-fixer");
  });

  it("spec-fixer + code-fixer → spec-fixer wins", () => {
    const findings: Finding[] = [
      makeFinding({ fixTarget: "code-fixer" }),
      makeFinding({ fixTarget: "spec-fixer" }),
    ];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:spec-fixer");
  });

  it("implementer + code-fixer → implementer wins", () => {
    const findings: Finding[] = [
      makeFinding({ fixTarget: "code-fixer" }),
      makeFinding({ fixTarget: "implementer" }),
    ];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:implementer");
  });

  it("all three present → spec-fixer wins", () => {
    const findings: Finding[] = [
      makeFinding({ fixTarget: "code-fixer" }),
      makeFinding({ fixTarget: "implementer" }),
      makeFinding({ fixTarget: "spec-fixer" }),
    ];
    expect(deriveConformanceVerdict(findings, true)).toBe("needs-fix:spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-04: ok=false → escalation
// ---------------------------------------------------------------------------
describe("TC-JVCONF-04: deriveConformanceVerdict — ok=false → escalation", () => {
  it("ok=false → escalation regardless of findings", () => {
    expect(deriveConformanceVerdict([], false)).toBe("escalation");
    expect(deriveConformanceVerdict([makeFinding({ fixTarget: "spec-fixer" })], false)).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-05: decision-needed → escalation
// ---------------------------------------------------------------------------
describe("TC-JVCONF-05: deriveConformanceVerdict — decision-needed → escalation", () => {
  it("decision-needed finding → escalation", () => {
    const findings: Finding[] = [makeFinding({ resolution: "decision-needed" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-06: no critical/high findings → approved
// ---------------------------------------------------------------------------
describe("TC-JVCONF-06: deriveConformanceVerdict — no critical/high → approved", () => {
  it("empty findings → approved", () => {
    expect(deriveConformanceVerdict([], true)).toBe("approved");
  });

  it("medium finding only → approved", () => {
    const findings: Finding[] = [makeFinding({ severity: "medium" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("approved");
  });

  it("low finding only → approved", () => {
    const findings: Finding[] = [makeFinding({ severity: "low" })];
    expect(deriveConformanceVerdict(findings, true)).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-07: aggregateFixTarget — single target values
// ---------------------------------------------------------------------------
describe("TC-JVCONF-07: aggregateFixTarget — single targets", () => {
  it("single spec-fixer finding → spec-fixer", () => {
    expect(aggregateFixTarget([makeFinding({ fixTarget: "spec-fixer" })])).toBe("spec-fixer");
  });

  it("single implementer finding → implementer", () => {
    expect(aggregateFixTarget([makeFinding({ fixTarget: "implementer" })])).toBe("implementer");
  });

  it("single code-fixer finding → code-fixer", () => {
    expect(aggregateFixTarget([makeFinding({ fixTarget: "code-fixer" })])).toBe("code-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-08: aggregateFixTarget — mixed targets priority
// ---------------------------------------------------------------------------
describe("TC-JVCONF-08: aggregateFixTarget — mixed targets priority", () => {
  it("spec-fixer + implementer → spec-fixer", () => {
    expect(aggregateFixTarget([
      makeFinding({ fixTarget: "implementer" }),
      makeFinding({ fixTarget: "spec-fixer" }),
    ])).toBe("spec-fixer");
  });

  it("implementer + code-fixer → implementer", () => {
    expect(aggregateFixTarget([
      makeFinding({ fixTarget: "code-fixer" }),
      makeFinding({ fixTarget: "implementer" }),
    ])).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-09: aggregateFixTarget — all omitted → implementer
// ---------------------------------------------------------------------------
describe("TC-JVCONF-09: aggregateFixTarget — all omitted → implementer", () => {
  it("no fixTarget → implementer", () => {
    expect(aggregateFixTarget([makeFinding(), makeFinding({ severity: "critical" })])).toBe("implementer");
  });

  it("empty findings array → code-fixer (lowest priority, no targets)", () => {
    // With no relevant findings, the Set has no targets; neither spec-fixer nor implementer → code-fixer
    // Actually with empty array, there are no findings to set has(), so it returns "code-fixer"
    // But that shouldn't happen in practice since deriveJudgeVerdict would return "approved"
    expect(aggregateFixTarget([])).toBe("code-fixer");
  });

  it("only medium/low severity findings → code-fixer (not relevant for aggregation)", () => {
    // medium/low severity findings are filtered out (not critical/high), so no relevant findings
    // → Set is empty → code-fixer
    expect(aggregateFixTarget([
      makeFinding({ severity: "medium", fixTarget: "spec-fixer" }),
      makeFinding({ severity: "low", fixTarget: "implementer" }),
    ])).toBe("code-fixer");
  });
});
