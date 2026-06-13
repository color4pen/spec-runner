/**
 * Fragment coverage tests.
 *
 * Verifies that:
 * 1. Prompts that use PIPELINE_RULES contain the full PIPELINE_RULES text.
 * 2. All 3 judge prompts reference the shared DECISION_NEEDED_DEFINITION (T-02).
 * 3. DECISION_NEEDED_DEFINITION contains the 4 required elements per spec.md.
 * 4. VERDICT_BLOCKING_RULES is accurate relative to judge-verdict.ts derivation.
 * 5. All 14 prompt symbols are provider-neutral (no report_result / end_turn).
 */
import { describe, it, expect } from "vitest";
import { DESIGN_SYSTEM_PROMPT, DESIGN_INITIAL_MESSAGE_TEMPLATE, buildInitialMessage } from "../design-system.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../implementer-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT, buildTestCaseGenInitialMessage } from "../test-case-gen-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../code-fixer-system.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../build-fixer-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../spec-fixer-system.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../adr-gen-system.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../conformance-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../code-review-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT, buildSpecReviewInitialMessage } from "../spec-review-system.js";
import { REGRESSION_GATE_SYSTEM_PROMPT } from "../regression-gate-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT, buildRequestReviewInitialMessage } from "../request-review-system.js";
import { buildCustomReviewerSystemPrompt } from "../custom-reviewer-system.js";
import { PIPELINE_RULES, COMPLETION_DIRECTIVE, COMPLETION_REPORT_LINE, COMPLETION_NO_EARLY_STOP_LINE } from "../fragments.js";
import { DECISION_NEEDED_DEFINITION, OBSERVATION_DEFINITION, VERDICT_BLOCKING_RULES } from "../judge-rules.js";
import type { ReviewerSnapshot } from "../../kernel/reviewer-snapshot.js";

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
// DECISION_NEEDED_DEFINITION — options requirement (T-03 AC)
// ---------------------------------------------------------------------------

describe("DECISION_NEEDED_DEFINITION contains options requirement", () => {
  it("mentions 'options' field requirement", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("options");
  });

  it("mentions label and consequence fields", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("label");
    expect(DECISION_NEEDED_DEFINITION).toContain("consequence");
  });

  it("requires at least 2 options", () => {
    expect(DECISION_NEEDED_DEFINITION).toContain("2 件以上");
  });
});

describe("3 judge prompts contain options requirement (via DECISION_NEEDED_DEFINITION)", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains options requirement", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("options");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("label");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("consequence");
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains options requirement", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("options");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("label");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("consequence");
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT contains options requirement", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("options");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("label");
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("consequence");
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

// ---------------------------------------------------------------------------
// T-09: OBSERVATION_DEFINITION content and 5-prompt coverage
// ---------------------------------------------------------------------------

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

describe("OBSERVATION_DEFINITION constant content (T-09)", () => {
  it("contains '対応不要だが記録すべき観察'", () => {
    expect(OBSERVATION_DEFINITION).toContain("対応不要だが記録すべき観察");
  });

  it("contains prohibition: reproductible problems must be findings", () => {
    expect(OBSERVATION_DEFINITION).toContain("再現手順を構成できる問題");
    expect(OBSERVATION_DEFINITION).toContain("finding");
  });
});

describe("5 judge prompts contain OBSERVATION_DEFINITION (T-09 AC)", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains OBSERVATION_DEFINITION", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(OBSERVATION_DEFINITION);
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains OBSERVATION_DEFINITION", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(OBSERVATION_DEFINITION);
  });

  it("REQUEST_REVIEW_SYSTEM_PROMPT contains OBSERVATION_DEFINITION", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(OBSERVATION_DEFINITION);
  });

  it("buildCustomReviewerSystemPrompt contains OBSERVATION_DEFINITION", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot());
    expect(prompt).toContain(OBSERVATION_DEFINITION);
  });

  it("REGRESSION_GATE_SYSTEM_PROMPT contains OBSERVATION_DEFINITION", () => {
    expect(REGRESSION_GATE_SYSTEM_PROMPT).toContain(OBSERVATION_DEFINITION);
  });
});

// ---------------------------------------------------------------------------
// T-07: Provider-neutral completion contract — all 14 prompt symbols
// ---------------------------------------------------------------------------

/** Minimal builder inputs for initial-message factories. */
function makeMinimalDesignInitialMessage(): string {
  return buildInitialMessage("req content", "test-slug", "feat/test-slug");
}

function makeMinimalTestCaseGenInitialMessage(): string {
  return buildTestCaseGenInitialMessage({
    slug: "test-slug",
    branch: "feat/test-slug",
    requestContent: "req content",
  });
}

function makeMinimalSpecReviewInitialMessage(): string {
  return buildSpecReviewInitialMessage({
    slug: "test-slug",
    requestType: "spec-change",
    iteration: 1,
  });
}

function makeMinimalRequestReviewInitialMessage(): string {
  return buildRequestReviewInitialMessage({
    slug: "test-slug",
    requestType: "spec-change",
    branch: "feat/test-slug",
    iteration: 1,
    findingsPath: "specrunner/changes/test-slug/request-review-result-001.md",
  });
}

/** All 14 prompt surface strings for neutrality iteration. */
const allPromptSymbols: Array<[string, string]> = [
  ["DESIGN_SYSTEM_PROMPT", DESIGN_SYSTEM_PROMPT],
  ["DESIGN_INITIAL_MESSAGE_TEMPLATE", DESIGN_INITIAL_MESSAGE_TEMPLATE],
  ["buildInitialMessage()", makeMinimalDesignInitialMessage()],
  ["IMPLEMENTER_SYSTEM_PROMPT", IMPLEMENTER_SYSTEM_PROMPT],
  ["TEST_CASE_GEN_SYSTEM_PROMPT", TEST_CASE_GEN_SYSTEM_PROMPT],
  ["buildTestCaseGenInitialMessage()", makeMinimalTestCaseGenInitialMessage()],
  ["CODE_FIXER_SYSTEM_PROMPT", CODE_FIXER_SYSTEM_PROMPT],
  ["BUILD_FIXER_SYSTEM_PROMPT", BUILD_FIXER_SYSTEM_PROMPT],
  ["SPEC_FIXER_SYSTEM_PROMPT", SPEC_FIXER_SYSTEM_PROMPT],
  ["ADR_GEN_SYSTEM_PROMPT", ADR_GEN_SYSTEM_PROMPT],
  ["CONFORMANCE_SYSTEM_PROMPT", CONFORMANCE_SYSTEM_PROMPT],
  ["CODE_REVIEW_SYSTEM_PROMPT", CODE_REVIEW_SYSTEM_PROMPT],
  ["SPEC_REVIEW_SYSTEM_PROMPT", SPEC_REVIEW_SYSTEM_PROMPT],
  ["buildSpecReviewInitialMessage()", makeMinimalSpecReviewInitialMessage()],
  ["REGRESSION_GATE_SYSTEM_PROMPT", REGRESSION_GATE_SYSTEM_PROMPT],
  ["REQUEST_REVIEW_SYSTEM_PROMPT", REQUEST_REVIEW_SYSTEM_PROMPT],
  ["buildRequestReviewInitialMessage()", makeMinimalRequestReviewInitialMessage()],
  ["buildCustomReviewerSystemPrompt()", buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot())],
];

describe("T-07: all prompt symbols do not contain report_result", () => {
  for (const [name, content] of allPromptSymbols) {
    it(`${name} does not contain "report_result"`, () => {
      expect(content).not.toContain("report_result");
    });
  }
});

describe("T-07: all prompt symbols do not contain end_turn", () => {
  for (const [name, content] of allPromptSymbols) {
    it(`${name} does not contain "end_turn"`, () => {
      expect(content).not.toContain("end_turn");
    });
  }
});

describe("T-07: all prompt symbols do not contain old completion intro/outro text", () => {
  for (const [name, content] of allPromptSymbols) {
    it(`${name} does not contain old intro "作業完了時は必ず"`, () => {
      expect(content).not.toContain("作業完了時は必ず");
    });
    it(`${name} does not contain old outro "tool を呼ばずに turn を終了"`, () => {
      expect(content).not.toContain("tool を呼ばずに turn を終了");
    });
  }
});

describe("T-07: producer 8 prompts contain COMPLETION_DIRECTIVE", () => {
  const producerPrompts: Array<[string, string]> = [
    ["DESIGN_SYSTEM_PROMPT", DESIGN_SYSTEM_PROMPT],
    ["IMPLEMENTER_SYSTEM_PROMPT", IMPLEMENTER_SYSTEM_PROMPT],
    ["TEST_CASE_GEN_SYSTEM_PROMPT", TEST_CASE_GEN_SYSTEM_PROMPT],
    ["CODE_FIXER_SYSTEM_PROMPT", CODE_FIXER_SYSTEM_PROMPT],
    ["BUILD_FIXER_SYSTEM_PROMPT", BUILD_FIXER_SYSTEM_PROMPT],
    ["SPEC_FIXER_SYSTEM_PROMPT", SPEC_FIXER_SYSTEM_PROMPT],
    ["ADR_GEN_SYSTEM_PROMPT", ADR_GEN_SYSTEM_PROMPT],
    ["CONFORMANCE_SYSTEM_PROMPT", CONFORMANCE_SYSTEM_PROMPT],
  ];
  for (const [name, content] of producerPrompts) {
    it(`${name} contains COMPLETION_DIRECTIVE`, () => {
      expect(content).toContain(COMPLETION_DIRECTIVE);
    });
  }
});

describe("T-07: judge 4 prompts contain COMPLETION_REPORT_LINE and COMPLETION_NO_EARLY_STOP_LINE", () => {
  const judgePrompts: Array<[string, string]> = [
    ["CODE_REVIEW_SYSTEM_PROMPT", CODE_REVIEW_SYSTEM_PROMPT],
    ["SPEC_REVIEW_SYSTEM_PROMPT", SPEC_REVIEW_SYSTEM_PROMPT],
    ["REGRESSION_GATE_SYSTEM_PROMPT", REGRESSION_GATE_SYSTEM_PROMPT],
    ["buildCustomReviewerSystemPrompt()", buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot())],
  ];
  for (const [name, content] of judgePrompts) {
    it(`${name} contains COMPLETION_REPORT_LINE`, () => {
      expect(content).toContain(COMPLETION_REPORT_LINE);
    });
    it(`${name} contains COMPLETION_NO_EARLY_STOP_LINE`, () => {
      expect(content).toContain(COMPLETION_NO_EARLY_STOP_LINE);
    });
  }
});

describe("T-07: VERDICT_BLOCKING_RULES does not contain report_result", () => {
  it("VERDICT_BLOCKING_RULES does not contain report_result", () => {
    expect(VERDICT_BLOCKING_RULES).not.toContain("report_result");
  });

  it("VERDICT_BLOCKING_RULES still contains decision-needed", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("decision-needed");
  });

  it("VERDICT_BLOCKING_RULES still contains escalation", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("escalation");
  });

  it("VERDICT_BLOCKING_RULES still contains needs-fix", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("needs-fix");
  });

  it("VERDICT_BLOCKING_RULES still contains findings 由来の導出が優先", () => {
    expect(VERDICT_BLOCKING_RULES).toContain("findings 由来の導出が優先");
  });
});
