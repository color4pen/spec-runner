/**
 * Drift-guard tests for EVIDENCE_COUNTS_DEFINITION fragment inclusion.
 *
 * Source: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source
 *
 * TC-016: 5 つの judge prompt が EVIDENCE_COUNTS_DEFINITION を含む
 * TC-017: EVIDENCE_COUNTS_DEFINITION が必須フィールドと vacuous ルールを記述する
 * TC-018: request-review prompt は EVIDENCE_COUNTS_DEFINITION を含まない
 */
import { describe, it, expect } from "vitest";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../spec-review-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../code-review-system.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../conformance-system.js";
import { REGRESSION_GATE_SYSTEM_PROMPT } from "../regression-gate-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../request-review-system.js";
import { buildCustomReviewerSystemPrompt } from "../custom-reviewer-system.js";
import type { ReviewerSnapshot } from "../../kernel/reviewer-snapshot.js";
// TC-016/017/018: EVIDENCE_COUNTS_DEFINITION is a new export added in T-07.
// Before T-07, it is undefined — tests will fail (RED).
// After T-07, it is defined — tests will pass (GREEN).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const judgeRulesModule = (await import("../judge-rules.js")) as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const EVIDENCE_COUNTS_DEFINITION = judgeRulesModule["EVIDENCE_COUNTS_DEFINITION"] as string | undefined;

function makeMinimalReviewerSnapshot(): ReviewerSnapshot {
  return {
    name: "test-reviewer",
    maxIterations: 3,
    purpose: "Test purpose",
    criteria: "Test criteria",
    judgment: "Test judgment",
    freeText: "",
  };
}

// ---------------------------------------------------------------------------
// TC-016: 5 つの judge prompt が EVIDENCE_COUNTS_DEFINITION を含む
// Source: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source
//         > Scenario: five judge prompts contain the evidence-counts fragment
// ---------------------------------------------------------------------------

describe("TC-016: five judge prompts contain EVIDENCE_COUNTS_DEFINITION", () => {
  it("TC-016: CODE_REVIEW_SYSTEM_PROMPT contains EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-016: SPEC_REVIEW_SYSTEM_PROMPT contains EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-016: buildCustomReviewerSystemPrompt() contains EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    const prompt = buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot());
    expect(prompt).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-016: CONFORMANCE_SYSTEM_PROMPT contains EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-016: REGRESSION_GATE_SYSTEM_PROMPT contains EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(REGRESSION_GATE_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });
});

// ---------------------------------------------------------------------------
// TC-017: EVIDENCE_COUNTS_DEFINITION が必須フィールドと vacuous ルールを記述する
// Source: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source
//         > Scenario: the fragment describes the required fields and the vacuous rule
// ---------------------------------------------------------------------------

describe("TC-017: EVIDENCE_COUNTS_DEFINITION content requirements", () => {
  it("TC-017: EVIDENCE_COUNTS_DEFINITION mentions 'evidence'", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).toContain("evidence");
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION mentions 'checked'", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).toContain("checked");
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION mentions 'skipped'", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).toContain("skipped");
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION mentions 'unverified'", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).toContain("unverified");
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION states that checked=0 is indeterminate / 判定不能", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    const hasIndeterminate =
      EVIDENCE_COUNTS_DEFINITION.includes("判定不能") ||
      EVIDENCE_COUNTS_DEFINITION.includes("indeterminate") ||
      EVIDENCE_COUNTS_DEFINITION.includes("checked === 0") ||
      EVIDENCE_COUNTS_DEFINITION.includes("checked=0");
    expect(hasIndeterminate).toBe(true);
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION does not contain 'report_result' (provider-neutral)", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).not.toContain("report_result");
  });

  it("TC-017: EVIDENCE_COUNTS_DEFINITION does not contain 'end_turn' (provider-neutral)", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(EVIDENCE_COUNTS_DEFINITION).not.toContain("end_turn");
  });
});

// ---------------------------------------------------------------------------
// TC-018: request-review prompt は EVIDENCE_COUNTS_DEFINITION を含まない
// Source: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source
//         > Scenario: request-review prompt omits the fragment
// ---------------------------------------------------------------------------

describe("TC-018: request-review prompt omits EVIDENCE_COUNTS_DEFINITION", () => {
  it("TC-018: REQUEST_REVIEW_SYSTEM_PROMPT does NOT contain EVIDENCE_COUNTS_DEFINITION", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet implemented (T-07 pending)");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).not.toContain(EVIDENCE_COUNTS_DEFINITION);
  });
});
