/**
 * Fragment coverage tests.
 *
 * Verifies that:
 * 1. Prompts that use PIPELINE_RULES contain the full PIPELINE_RULES text.
 * 2. All 3 judge prompts reference the shared DECISION_NEEDED_DEFINITION (T-02).
 * 3. DECISION_NEEDED_DEFINITION contains the 4 required elements per spec.md.
 * 4. VERDICT_BLOCKING_RULES is accurate relative to judge-verdict.ts derivation.
 */
import { describe, it, expect } from "vitest";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../code-review-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../spec-review-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../request-review-system.js";
import { PIPELINE_RULES } from "../fragments.js";
import { DECISION_NEEDED_DEFINITION, VERDICT_BLOCKING_RULES } from "../judge-rules.js";

// ---------------------------------------------------------------------------
// PIPELINE_RULES inclusion
// ---------------------------------------------------------------------------

describe("PIPELINE_RULES inclusion in prompts that declare it", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains PIPELINE_RULES", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(PIPELINE_RULES);
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains PIPELINE_RULES", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(PIPELINE_RULES);
  });
});

// ---------------------------------------------------------------------------
// DECISION_NEEDED_DEFINITION content requirements (validates the constant itself)
// ---------------------------------------------------------------------------

describe("DECISION_NEEDED_DEFINITION constant content", () => {
  it("contains author-only limitation", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("作成者でなければ決められない");
  });

  it("contains applicable examples", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("該当例");
  });

  it("contains non-applicable examples", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("非該当例");
  });

  it("contains fixable fallback guidance", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("fixable");
  });

  it("does not contain the old vague definition", () => {
    expect(DECISION_NEEDED_DEFINITION).not.toContain("設計判断が必要で、自動修正では解決不可能");
    expect(DECISION_NEEDED_DEFINITION).not.toContain("人間の設計判断が必要");
  });
});

// ---------------------------------------------------------------------------
// 3 prompts reference DECISION_NEEDED_DEFINITION (T-02 AC: shared reference)
// ---------------------------------------------------------------------------

describe("3 judge prompts reference DECISION_NEEDED_DEFINITION", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains DECISION_NEEDED_DEFINITION", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(DECISION_NEEDED_DEFINITION);
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains DECISION_NEEDED_DEFINITION", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(DECISION_NEEDED_DEFINITION);
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT contains DECISION_NEEDED_DEFINITION", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(DECISION_NEEDED_DEFINITION);
  });
});

// ---------------------------------------------------------------------------
// Old definitions must not remain in prompts (T-02 AC: no old text)
// ---------------------------------------------------------------------------

describe("old decision-needed definitions are removed from prompts", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT does not contain old definition", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain("設計判断が必要で、自動修正では解決不可能");
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT does not contain old definition", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).not.toContain("設計判断が必要で、自動修正では解決不可能");
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT does not contain old definition", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).not.toContain("人間の設計判断が必要");
  });
});

// ---------------------------------------------------------------------------
// VERDICT_BLOCKING_RULES content requirements (validates the constant)
// ---------------------------------------------------------------------------

describe("VERDICT_BLOCKING_RULES constant content", () => {
  it("contains decision-needed → escalation rule", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("decision-needed");
    expect(VERDICT_BLOCKING_RULES).toContain("escalation");
  });

  it("contains request-review → needs-discussion note", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("needs-discussion");
  });

  it("contains critical|high → needs-fix rule", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("needs-fix");
  });

  it("states findings take priority over markdown verdict line", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("findings 由来の導出が優先");
  });
});

// ---------------------------------------------------------------------------
// VERDICT_BLOCKING_RULES referenced in prompts and PIPELINE_RULES (T-04 AC)
// ---------------------------------------------------------------------------

describe("prompts reference VERDICT_BLOCKING_RULES", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains VERDICT_BLOCKING_RULES", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(VERDICT_BLOCKING_RULES);
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT contains VERDICT_BLOCKING_RULES", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(VERDICT_BLOCKING_RULES);
  });

  it("PIPELINE_RULES contains VERDICT_BLOCKING_RULES", () => {
    expect(PIPELINE_RULES).toContain(VERDICT_BLOCKING_RULES);
  });
});

// ---------------------------------------------------------------------------
// Old verdict-authority text must not remain (T-04 AC)
// ---------------------------------------------------------------------------

describe("old 'verdict line is authoritative' text is removed from prompts", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT does not contain old verdict-authority text", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain("Your verdict line is the authoritative decision");
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT Verdict Derivation Rules does not say HIGH-only blocking", () => {
    // The old rules said "No HIGH severity findings" for approve — no mention of decision-needed
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).not.toContain("No HIGH severity findings. The request is ready");
  });
});
