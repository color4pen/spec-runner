/**
 * Tests for evidence-aware verdict derivation functions.
 *
 * Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
 *         spec.md > Requirement: regression-gate reports evidence but its verdict derivation is unchanged
 *
 * TC-007: checked=0 + findings:[] で escalation になる
 * TC-008: checked>0 + findings:[] で approved になる
 * TC-009: checked>0 + blocking findings で needs-fix になる（導出不変）
 * TC-010: checked>0 + decision-needed finding で escalation になる（導出不変）
 * TC-011: conformance の checked=0 で escalation になる
 * TC-012: evidence 引数なしの呼び出しは従来導出（後方互換）
 * TC-013: regression-gate の verdict 導出は evidence に影響されない
 * TC-026: deriveRegressionGateVerdict（2 引数）が judgeVerdictFn 型（3 引数 optional）に代入できる
 */
import { describe, it, expect } from "vitest";
import {
  deriveJudgeVerdict,
  deriveConformanceVerdict,
  deriveRegressionGateVerdict,
} from "../judge-verdict.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { AgentStep } from "../../port/step-types.js";

// After T-01, Evidence type will be exported from kernel/report-result.ts.
// Before T-01, we define a local equivalent for use in test casts.
// This local definition matches the shape specified in tasks.md T-01.
type Evidence = { checked: number; skipped: number; unverified: number };

// After T-04, deriveJudgeVerdict/deriveConformanceVerdict accept evidence as 3rd optional arg.
// Before T-04, we cast to the future signature to call it at runtime.
// At runtime (JavaScript), extra arguments are silently ignored by the pre-T-04 implementation,
// so tests calling with evidence will fail at the assertion level (not with a runtime error).
type JudgeVerdictWithEvidence = (
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
) => "approved" | "needs-fix" | "escalation";

type ConformanceVerdictWithEvidence = (
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
) => "approved" | "escalation" | "needs-fix:implementer" | "needs-fix:code-fixer" | "needs-fix:spec-fixer";

const judgeVerdictFn = deriveJudgeVerdict as unknown as JudgeVerdictWithEvidence;
const conformanceVerdictFn = deriveConformanceVerdict as unknown as ConformanceVerdictWithEvidence;

function finding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
): Finding {
  return {
    severity,
    resolution,
    file: "src/example.ts",
    title: "test finding",
    rationale: "test rationale",
  };
}

// ---------------------------------------------------------------------------
// TC-007: checked=0 + findings:[] → escalation
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: zero checked with empty findings escalates
// ---------------------------------------------------------------------------

describe("TC-007: zero checked with empty findings escalates", () => {
  it("TC-007: deriveJudgeVerdict([], true, { checked: 0, skipped: 3, unverified: 0 }) → 'escalation'", () => {
    const result = judgeVerdictFn([], true, { checked: 0, skipped: 3, unverified: 0 });
    expect(result).toBe("escalation");
  });

  it("TC-007: deriveJudgeVerdict([], true, { checked: 0, skipped: 0, unverified: 5 }) → 'escalation' (unverified only also counts as checked=0)", () => {
    const result = judgeVerdictFn([], true, { checked: 0, skipped: 0, unverified: 5 });
    expect(result).toBe("escalation");
  });

  it("TC-007: deriveJudgeVerdict([], true, { checked: 0, skipped: 0, unverified: 0 }) → 'escalation' (all zeros)", () => {
    const result = judgeVerdictFn([], true, { checked: 0, skipped: 0, unverified: 0 });
    expect(result).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-008: checked>0 + findings:[] → approved
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: positive checked with empty findings approves
// ---------------------------------------------------------------------------

describe("TC-008: positive checked with empty findings approves", () => {
  it("TC-008: deriveJudgeVerdict([], true, { checked: 5, skipped: 0, unverified: 0 }) → 'approved'", () => {
    const result = judgeVerdictFn([], true, { checked: 5, skipped: 0, unverified: 0 });
    expect(result).toBe("approved");
  });

  it("TC-008: deriveJudgeVerdict([], true, { checked: 1, skipped: 10, unverified: 2 }) → 'approved' (checked=1 > 0)", () => {
    const result = judgeVerdictFn([], true, { checked: 1, skipped: 10, unverified: 2 });
    expect(result).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-009: checked>0 + blocking findings → needs-fix (unchanged)
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: positive checked with blocking findings is unchanged
// ---------------------------------------------------------------------------

describe("TC-009: positive checked with blocking findings is unchanged (needs-fix)", () => {
  it("TC-009: deriveJudgeVerdict([critical/fixable], true, { checked: 2, ... }) → 'needs-fix'", () => {
    const result = judgeVerdictFn([finding("critical", "fixable")], true, { checked: 2, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-fix");
  });

  it("TC-009: deriveJudgeVerdict([high/fixable], true, { checked: 2, ... }) → 'needs-fix'", () => {
    const result = judgeVerdictFn([finding("high", "fixable")], true, { checked: 2, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-fix");
  });

  it("TC-009: deriveJudgeVerdict([medium/fixable], true, { checked: 2, ... }) → 'approved' (medium not blocking)", () => {
    const result = judgeVerdictFn([finding("medium", "fixable")], true, { checked: 2, skipped: 0, unverified: 0 });
    expect(result).toBe("approved");
  });

  it("TC-009: deriveJudgeVerdict([low/fixable], true, { checked: 2, ... }) → 'approved' (low not blocking)", () => {
    const result = judgeVerdictFn([finding("low", "fixable")], true, { checked: 2, skipped: 0, unverified: 0 });
    expect(result).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-010: checked>0 + decision-needed finding → escalation (unchanged)
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: positive checked with decision-needed finding is unchanged
// ---------------------------------------------------------------------------

describe("TC-010: positive checked with decision-needed finding is unchanged (escalation)", () => {
  it("TC-010: deriveJudgeVerdict([low/decision-needed], true, { checked: 2, ... }) → 'escalation'", () => {
    const result = judgeVerdictFn([finding("low", "decision-needed")], true, { checked: 2, skipped: 0, unverified: 0 });
    expect(result).toBe("escalation");
  });

  it("TC-010: deriveJudgeVerdict([medium/decision-needed], true, { checked: 3, ... }) → 'escalation'", () => {
    const result = judgeVerdictFn([finding("medium", "decision-needed")], true, { checked: 3, skipped: 0, unverified: 0 });
    expect(result).toBe("escalation");
  });

  it("TC-010: decision-needed takes priority over checked>0 blocking detection (escalation over needs-fix)", () => {
    const findings = [
      finding("critical", "fixable"),
      finding("low", "decision-needed"),
    ];
    const result = judgeVerdictFn(findings, true, { checked: 5, skipped: 0, unverified: 0 });
    expect(result).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-011: conformance の checked=0 → escalation
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: conformance with zero checked escalates
// ---------------------------------------------------------------------------

describe("TC-011: conformance with zero checked escalates", () => {
  it("TC-011: deriveConformanceVerdict([], true, { checked: 0, skipped: 0, unverified: 0 }) → 'escalation'", () => {
    const result = conformanceVerdictFn([], true, { checked: 0, skipped: 0, unverified: 0 });
    expect(result).toBe("escalation");
  });

  it("TC-011: deriveConformanceVerdict([], true, { checked: 0, skipped: 3, unverified: 0 }) → 'escalation'", () => {
    const result = conformanceVerdictFn([], true, { checked: 0, skipped: 3, unverified: 0 });
    expect(result).toBe("escalation");
  });

  it("TC-011: deriveConformanceVerdict with checked>0 + empty findings → 'approved'", () => {
    const result = conformanceVerdictFn([], true, { checked: 3, skipped: 0, unverified: 0 });
    expect(result).toBe("approved");
  });

  it("TC-011: deriveConformanceVerdict with checked>0 + high/fixable → 'needs-fix:implementer' (fixTarget aggregation unchanged)", () => {
    const result = conformanceVerdictFn([finding("high", "fixable")], true, { checked: 1, skipped: 0, unverified: 0 });
    expect(result).toBe("needs-fix:implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-012: evidence 引数なし → 従来導出（後方互換）
// Source: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion
//         > Scenario: absent evidence preserves legacy derivation
// ---------------------------------------------------------------------------

describe("TC-012: absent evidence preserves legacy derivation (backward compat)", () => {
  it("TC-012: deriveJudgeVerdict([], true) → 'approved' (no evidence = legacy path)", () => {
    expect(deriveJudgeVerdict([], true)).toBe("approved");
  });

  it("TC-012: deriveJudgeVerdict([critical/fixable], true) → 'needs-fix' (no evidence = legacy path)", () => {
    expect(deriveJudgeVerdict([finding("critical", "fixable")], true)).toBe("needs-fix");
  });

  it("TC-012: deriveJudgeVerdict([], false) → 'escalation' (no evidence = legacy path)", () => {
    expect(deriveJudgeVerdict([], false)).toBe("escalation");
  });

  it("TC-012: deriveJudgeVerdict([low/decision-needed], true) → 'escalation' (no evidence = legacy path)", () => {
    expect(deriveJudgeVerdict([finding("low", "decision-needed")], true)).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-013: regression-gate の verdict 導出は evidence に影響されない
// Source: spec.md > Requirement: regression-gate reports evidence but its verdict derivation is unchanged
//         > Scenario: regression-gate verdict derivation is unaffected by evidence
// ---------------------------------------------------------------------------

describe("TC-013: regression-gate verdict derivation is unaffected by evidence", () => {
  it("TC-013: deriveRegressionGateVerdict([], true) → 'approved' (no evidence argument; unchanged)", () => {
    expect(deriveRegressionGateVerdict([], true)).toBe("approved");
  });

  it("TC-013: deriveRegressionGateVerdict([low/fixable], true) → 'needs-fix' (any fixable still triggers needs-fix)", () => {
    expect(deriveRegressionGateVerdict([finding("low", "fixable")], true)).toBe("needs-fix");
  });

  it("TC-013: deriveRegressionGateVerdict([medium/fixable], true) → 'needs-fix'", () => {
    expect(deriveRegressionGateVerdict([finding("medium", "fixable")], true)).toBe("needs-fix");
  });

  it("TC-013: deriveRegressionGateVerdict([], false) → 'escalation'", () => {
    expect(deriveRegressionGateVerdict([], false)).toBe("escalation");
  });

  it("TC-013: regression-gate step carries judgeVerdictFn === deriveRegressionGateVerdict (unchanged)", async () => {
    const { createRegressionGateStep } = await import("../regression-gate.js");
    const step = createRegressionGateStep();
    expect(step.judgeVerdictFn).toBe(deriveRegressionGateVerdict);
  });
});

// ---------------------------------------------------------------------------
// TC-026: deriveRegressionGateVerdict（2 引数）が judgeVerdictFn 型（3 引数 optional）に代入できる
// Source: tasks.md T-04
// ---------------------------------------------------------------------------

describe("TC-026: deriveRegressionGateVerdict (2-arg) is assignable to judgeVerdictFn type (3-arg optional)", () => {
  it("TC-026: TypeScript — deriveRegressionGateVerdict is assignable to AgentStep.judgeVerdictFn type", () => {
    // After T-04, judgeVerdictFn type is (findings, ok, evidence?) => ...
    // A 2-arg function is assignable to a 3-arg-optional signature.
    // This test verifies runtime behavior (type check is compile-time).
    // If this compiles without @ts-expect-error, TC-026 is satisfied.
    const fn: AgentStep["judgeVerdictFn"] = deriveRegressionGateVerdict;
    // Call it to verify it works at runtime too
    const result = fn?.([], true);
    expect(result).toBe("approved");
  });
});
