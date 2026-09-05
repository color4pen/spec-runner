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
 * TC-JVCONF-10: R1b — mixed spec-fixer+code-fixer with remediation → escalation (aggregated fixer cannot write all sites)
 * TC-JVCONF-11: R1b — pure spec-fixer findings on spec.md with remediation + canonScope → needs-fix:spec-fixer (no escalation)
 */
import { describe, it, expect } from "vitest";
import { deriveConformanceVerdict, aggregateFixTarget } from "../../../../src/core/step/judge-verdict.js";
import type { Finding, FixTarget } from "../../../../src/kernel/report-result.js";
import type { CanonWriteScope } from "../../../../src/core/step/canon-escalation.js";

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

// ---------------------------------------------------------------------------
// Helpers for R1b tests (TC-JVCONF-10, TC-JVCONF-11)
// ---------------------------------------------------------------------------

const SLUG = "test-slug";

/**
 * Minimal CanonWriteScope for R1b tests.
 * - canonPaths: the standard 6-file set for SLUG
 * - writableByFixer: code-fixer=∅, implementer={tasks.md}, spec-fixer={spec.md, design.md, tasks.md}
 * - broadWriteFixers absent → DEFAULT_BROAD_WRITE_FIXERS = {code-fixer, implementer}
 */
function makeCanonScopeForR1b(): CanonWriteScope {
  const canonPaths = new Set([
    `specrunner/changes/${SLUG}/request.md`,
    `specrunner/changes/${SLUG}/spec.md`,
    `specrunner/changes/${SLUG}/design.md`,
    `specrunner/changes/${SLUG}/tasks.md`,
    `specrunner/changes/${SLUG}/test-cases.md`,
    `specrunner/changes/${SLUG}/request-review-attestation.json`,
  ]);
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    ["code-fixer", new Set()],
    ["implementer", new Set([`specrunner/changes/${SLUG}/tasks.md`])],
    [
      "spec-fixer",
      new Set([
        `specrunner/changes/${SLUG}/spec.md`,
        `specrunner/changes/${SLUG}/design.md`,
        `specrunner/changes/${SLUG}/tasks.md`,
      ]),
    ],
  ]);
  return { canonPaths, writableByFixer };
}

// ---------------------------------------------------------------------------
// TC-JVCONF-10: R1b — mixed spec-fixer+code-fixer with remediation → escalation
//
// Scenario: conformance yields two findings:
//   A) fixTarget=spec-fixer, site=spec.md (canon, spec-fixer writable)
//   B) fixTarget=code-fixer, site=src/impl.ts (non-canon, code-fixer writable)
//
// R1a: each finding's own fixTarget can write its site → no escalation from R1a.
// aggregateFixTarget: spec-fixer wins (highest priority).
// R1b: re-check with aggregated fixer=spec-fixer.
//   Finding B: src/impl.ts is non-canon → spec-fixer ∉ broadWriteFixers → unroutable → escalation.
// ---------------------------------------------------------------------------
describe("TC-JVCONF-10: R1b — mixed spec-fixer+code-fixer findings with remediation → escalation", () => {
  it("spec-fixer finding (spec.md) + code-fixer finding (src/**) + canonScope → escalation (R1b)", () => {
    const specFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/spec.md`,
      title: "Spec conformance issue",
      rationale: "Fix spec",
      fixTarget: "spec-fixer",
      remediation: {
        invariant: "spec.md must conform",
        sites: [{ file: `specrunner/changes/${SLUG}/spec.md` }],
        approach: "Update spec",
      },
    };
    const codeFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/impl.ts",
      title: "Implementation conformance issue",
      rationale: "Fix code",
      fixTarget: "code-fixer",
      remediation: {
        invariant: "src/impl.ts must conform",
        sites: [{ file: "src/impl.ts" }],
        approach: "Update code",
      },
    };
    const scope = makeCanonScopeForR1b();

    // Without canonScope: spec-fixer wins by priority, no R1b → needs-fix:spec-fixer
    expect(deriveConformanceVerdict([specFinding, codeFinding], true)).toBe("needs-fix:spec-fixer");

    // With canonScope: R1b detects src/impl.ts is unwritable by spec-fixer → escalation
    expect(deriveConformanceVerdict([specFinding, codeFinding], true, undefined, scope)).toBe("escalation");
  });

  it("implementer finding (tasks.md) + code-fixer finding (src/**) + canonScope → needs-fix:implementer (R1b passes)", () => {
    // aggregateFixTarget = implementer (implementer > code-fixer)
    // R1b: implementer IS in DEFAULT_BROAD_WRITE_FIXERS → can write non-canon src/** → routable
    // → needs-fix:implementer (no escalation)
    const implementerFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/tasks.md`,
      title: "Tasks conformance issue",
      rationale: "Fix tasks",
      fixTarget: "implementer",
      remediation: {
        invariant: "tasks.md must conform",
        sites: [{ file: `specrunner/changes/${SLUG}/tasks.md` }],
        approach: "Update tasks",
      },
    };
    const codeFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/impl.ts",
      title: "Implementation conformance issue",
      rationale: "Fix code",
      fixTarget: "code-fixer",
      remediation: {
        invariant: "src/impl.ts must conform",
        sites: [{ file: "src/impl.ts" }],
        approach: "Update code",
      },
    };
    const scope = makeCanonScopeForR1b();

    // Both without and with canonScope: implementer wins and can write src/** → needs-fix:implementer
    expect(deriveConformanceVerdict([implementerFinding, codeFinding], true)).toBe("needs-fix:implementer");
    expect(deriveConformanceVerdict([implementerFinding, codeFinding], true, undefined, scope)).toBe("needs-fix:implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-JVCONF-11: R1b — pure spec-fixer findings on spec.md with remediation → needs-fix:spec-fixer
//
// Scenario: all findings are spec-fixer with spec.md sites.
// aggregateFixTarget = spec-fixer.
// R1b: spec.md is canon and in writableByFixer[spec-fixer] → routable → no escalation.
// ---------------------------------------------------------------------------
describe("TC-JVCONF-11: R1b — pure spec-fixer findings on spec.md with remediation → needs-fix:spec-fixer", () => {
  it("two spec-fixer findings on spec.md with canonScope → needs-fix:spec-fixer (R1b passes)", () => {
    const f1: Finding = {
      severity: "high",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/spec.md`,
      title: "Spec issue 1",
      rationale: "Fix it",
      fixTarget: "spec-fixer",
      remediation: {
        invariant: "spec.md must conform",
        sites: [{ file: `specrunner/changes/${SLUG}/spec.md` }],
        approach: "Update spec",
      },
    };
    const f2: Finding = {
      severity: "critical",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/spec.md`,
      title: "Spec issue 2",
      rationale: "Fix it",
      fixTarget: "spec-fixer",
      remediation: {
        invariant: "spec.md must conform",
        sites: [{ file: `specrunner/changes/${SLUG}/spec.md` }],
        approach: "Update spec",
      },
    };
    const scope = makeCanonScopeForR1b();

    expect(deriveConformanceVerdict([f1, f2], true, undefined, scope)).toBe("needs-fix:spec-fixer");
  });

  it("code-fixer finding on src/** WITHOUT remediation + canonScope → needs-fix:code-fixer (legacy path, no R1b escalation)", () => {
    // Legacy path: no remediation → only primary file checked for canon membership.
    // src/foo.ts is NOT in canonPaths → not unroutable in legacy path.
    // R1b also uses legacy path for this finding → no escalation.
    const finding = makeFinding({ fixTarget: "code-fixer" }); // file: "src/foo.ts", no remediation
    const scope = makeCanonScopeForR1b();

    expect(deriveConformanceVerdict([finding], true, undefined, scope)).toBe("needs-fix:code-fixer");
  });
});
