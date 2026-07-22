/**
 * Drift-guard tests for EVIDENCE_COUNTS_DEFINITION injection into request-review prompt.
 *
 * Source: spec.md > Requirement: request-review prompt SHALL instruct evidence reporting from a single source
 *
 * TC-011: REQUEST_REVIEW_SYSTEM_PROMPT が EVIDENCE_COUNTS_DEFINITION を含む
 * TC-012: prompt への注入がインライン複製でなく単一ソース定数参照である
 */
import { describe, it, expect } from "vitest";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../request-review-system.js";

// TC-011/012: EVIDENCE_COUNTS_DEFINITION must be imported into request-review-system.ts (T-05).
// Before T-05, the constant exists in judge-rules.ts but is not yet injected into the prompt.
// We import it from judge-rules.ts and use toContain to verify single-source derivation.
// If the implementation uses an inline copy instead of the import, any future change to
// EVIDENCE_COUNTS_DEFINITION in judge-rules.ts would break this test — enforcing single-source.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const judgeRulesModule = (await import("../judge-rules.js")) as any;
const EVIDENCE_COUNTS_DEFINITION = judgeRulesModule["EVIDENCE_COUNTS_DEFINITION"] as string | undefined;

// ---------------------------------------------------------------------------
// TC-011: REQUEST_REVIEW_SYSTEM_PROMPT が EVIDENCE_COUNTS_DEFINITION を含む
// Source: spec.md > Requirement: request-review prompt SHALL instruct evidence reporting from a single source
//         > Scenario: request-review prompt contains the evidence-counts fragment
// ---------------------------------------------------------------------------

describe("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT が EVIDENCE_COUNTS_DEFINITION を含む", () => {
  it("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT contains EVIDENCE_COUNTS_DEFINITION (exact match from judge-rules.ts)", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts (implementation pending)");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT contains 'checked' keyword (from evidence counts definition)", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("checked");
  });

  it("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT contains 'skipped' keyword", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("skipped");
  });

  it("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT contains 'unverified' keyword", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("unverified");
  });

  it("TC-011: REQUEST_REVIEW_SYSTEM_PROMPT contains 'evidence' keyword", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-012: prompt への注入がインライン複製でなく単一ソース定数参照である
// Source: spec.md > Requirement: request-review prompt SHALL instruct evidence reporting from a single source
//         > Scenario: the injected instruction is not a duplicated literal
// ---------------------------------------------------------------------------

describe("TC-012: prompt への注入がインライン複製でなく単一ソース定数参照である", () => {
  it("TC-012: REQUEST_REVIEW_SYSTEM_PROMPT.toContain(EVIDENCE_COUNTS_DEFINITION) verifies single-source derivation", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    // Structural enforcement of single-source: by asserting that the prompt contains
    // the exact text of the imported constant, any future divergence (e.g. the constant
    // changes but an inline copy in the prompt does not) will cause this test to fail.
    // This is the same drift-guard pattern used by TC-016 for the 5 judge prompts.
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(EVIDENCE_COUNTS_DEFINITION);
  });

  it("TC-012: EVIDENCE_COUNTS_DEFINITION is a non-empty string (single source exists)", () => {
    if (EVIDENCE_COUNTS_DEFINITION === undefined) {
      throw new Error("EVIDENCE_COUNTS_DEFINITION not yet defined in judge-rules.ts");
    }
    expect(typeof EVIDENCE_COUNTS_DEFINITION).toBe("string");
    expect(EVIDENCE_COUNTS_DEFINITION.length).toBeGreaterThan(0);
  });
});
