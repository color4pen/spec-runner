/**
 * step-output-templates tests.
 *
 * Verifies that result templates contain correct blocking conditions
 * (decision-needed included, HIGH-only blocking removed) and that
 * findings-priority semantics are expressed correctly.
 */
import { describe, it, expect } from "vitest";
import {
  REQUEST_REVIEW_RESULT_TEMPLATE,
  SPEC_REVIEW_RESULT_TEMPLATE,
  REVIEW_FEEDBACK_TEMPLATE,
} from "../step-output-templates.js";
import { VERDICT_BLOCKING_RULES } from "../../prompts/judge-rules.js";

// ---------------------------------------------------------------------------
// request-review template: blocking must include decision-needed (T-03 AC)
// ---------------------------------------------------------------------------

describe("REQUEST_REVIEW_RESULT_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("blocking condition includes decision-needed", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("decision-needed");
  });

  it("does not contain old HIGH-only blocking text", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).not.toContain("Approval is blocked when HIGH ≥ 1");
  });

  it("verdict line format requirement is present", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("verdict line format");
  });
});

// ---------------------------------------------------------------------------
// spec-review template: blocking must include decision-needed (T-03 AC)
// ---------------------------------------------------------------------------

describe("SPEC_REVIEW_RESULT_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("blocking condition includes decision-needed", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("decision-needed");
  });

  it("does not contain old CRITICAL/HIGH-only blocking text", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).not.toContain("Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1");
  });

  it("verdict line format requirement is present", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("verdict line format");
  });
});

// ---------------------------------------------------------------------------
// review-feedback template: findings priority over verdict line (T-03 AC)
// ---------------------------------------------------------------------------

describe("REVIEW_FEEDBACK_TEMPLATE", () => {
  it("contains VERDICT_BLOCKING_RULES", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain(VERDICT_BLOCKING_RULES);
  });

  it("states findings take priority over markdown verdict line", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("findings 由来の導出が優先");
  });

  it("does not contain old 'verdict line is the authoritative decision' text", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).not.toContain("The verdict line is the authoritative decision");
  });

  it("verdict line format requirement is present", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("verdict line format");
  });
});
