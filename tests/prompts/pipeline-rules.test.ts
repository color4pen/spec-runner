/**
 * Unit tests for src/prompts/pipeline-rules.ts
 *
 * TC-01: pipeline-rules.ts が存在し PIPELINE_RULES を export する
 * TC-02: PIPELINE_RULES に Severity セクションが含まれる
 * TC-03: PIPELINE_RULES に Categories セクションが含まれる
 * TC-04: PIPELINE_RULES に Findings Format セクションが含まれる
 * TC-05: PIPELINE_RULES に Scoring セクションが含まれる
 * TC-06: PIPELINE_RULES に Verdict セクションが含まれる
 * TC-07: PIPELINE_RULES に Iteration Comparison セクションが含まれる
 * TC-08: PIPELINE_RULES に Authority matrix が含まれない
 * TC-10: code-review-system.ts が PIPELINE_RULES を import する
 * TC-11: code-review の system prompt に PIPELINE_RULES が展開されている
 * TC-12: code-review-system.ts の .claude/rules 参照が削除されている
 * TC-15: spec-review-system.ts が PIPELINE_RULES を import する
 * TC-16: spec-review の system prompt に PIPELINE_RULES が展開されている
 * TC-17: spec-review-system.ts の review-standards.md severity definitions 参照が削除されている
 * TC-18: spec-review-system.ts の inline Severity levels 定義が削除されている
 * TC-27: PIPELINE_RULES が TypeScript string 型として export されている
 */
import { describe, it, expect } from "vitest";
import { PIPELINE_RULES } from "../../src/prompts/pipeline-rules.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/code-review-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/spec-review-system.js";

// ---------------------------------------------------------------------------
// TC-01 & TC-27: PIPELINE_RULES exists and is a string
// ---------------------------------------------------------------------------
describe("TC-01 & TC-27: PIPELINE_RULES exported as string", () => {
  it("PIPELINE_RULES is exported and is a non-empty string", () => {
    expect(typeof PIPELINE_RULES).toBe("string");
    expect(PIPELINE_RULES.length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// TC-02: Severity section
// ---------------------------------------------------------------------------
describe("TC-02: PIPELINE_RULES contains Severity section", () => {
  it("contains all four severity levels", () => {
    expect(PIPELINE_RULES).toContain("CRITICAL");
    expect(PIPELINE_RULES).toContain("HIGH");
    expect(PIPELINE_RULES).toContain("MEDIUM");
    expect(PIPELINE_RULES).toContain("LOW");
  });

  it("contains approval block condition", () => {
    expect(PIPELINE_RULES).toMatch(/CRITICAL.*≥.*1.*HIGH.*≥.*1|承認阻止条件/s);
    expect(PIPELINE_RULES).toContain("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-03: Categories section
// ---------------------------------------------------------------------------
describe("TC-03: PIPELINE_RULES contains all 9 categories", () => {
  const categories = [
    "correctness",
    "security",
    "architecture",
    "performance",
    "maintainability",
    "testing",
    "completeness",
    "consistency",
    "feasibility",
  ];

  for (const category of categories) {
    it(`contains category: ${category}`, () => {
      expect(PIPELINE_RULES).toContain(category);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-04: Findings Format section
// ---------------------------------------------------------------------------
describe("TC-04: PIPELINE_RULES contains Findings Format section", () => {
  it("contains all required columns", () => {
    expect(PIPELINE_RULES).toContain("# |");
    expect(PIPELINE_RULES).toContain("Severity");
    expect(PIPELINE_RULES).toContain("Category");
    expect(PIPELINE_RULES).toContain("File");
    expect(PIPELINE_RULES).toContain("Description");
    expect(PIPELINE_RULES).toContain("How to Fix");
  });

  it("contains File column format note", () => {
    expect(PIPELINE_RULES).toMatch(/\{path\}:\{line\}|path.*line/);
  });

  it("contains How to Fix column note about specific guidance", () => {
    expect(PIPELINE_RULES).toContain("How to Fix");
    expect(PIPELINE_RULES).toMatch(/具体的|抽象表現は不可/);
  });
});

// ---------------------------------------------------------------------------
// TC-05: Scoring section
// ---------------------------------------------------------------------------
describe("TC-05: PIPELINE_RULES contains Scoring section", () => {
  it("contains Score 1-10 table", () => {
    expect(PIPELINE_RULES).toContain("1-3");
    expect(PIPELINE_RULES).toContain("9-10");
  });

  it("contains Weight table for 6 categories", () => {
    expect(PIPELINE_RULES).toContain("0.30");
    expect(PIPELINE_RULES).toContain("0.25");
    expect(PIPELINE_RULES).toContain("0.15");
    expect(PIPELINE_RULES).toContain("0.10");
  });

  it("contains pass threshold 7.0", () => {
    expect(PIPELINE_RULES).toContain("7.0");
  });
});

// ---------------------------------------------------------------------------
// TC-06: Verdict section
// ---------------------------------------------------------------------------
describe("TC-06: PIPELINE_RULES contains Verdict section", () => {
  it("contains approved verdict", () => {
    expect(PIPELINE_RULES).toContain("approved");
  });

  it("contains needs-fix verdict", () => {
    expect(PIPELINE_RULES).toContain("needs-fix");
  });

  it("contains escalation verdict", () => {
    expect(PIPELINE_RULES).toContain("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-07: Iteration Comparison section
// ---------------------------------------------------------------------------
describe("TC-07: PIPELINE_RULES contains Iteration Comparison section", () => {
  it("contains Improvements, Regressions, Unchanged Issues", () => {
    expect(PIPELINE_RULES).toContain("Improvements");
    expect(PIPELINE_RULES).toContain("Regressions");
    expect(PIPELINE_RULES).toContain("Unchanged");
  });

  it("contains Convergence Trend table with all trend values", () => {
    expect(PIPELINE_RULES).toContain("improving");
    expect(PIPELINE_RULES).toContain("plateaued");
    expect(PIPELINE_RULES).toContain("regressing");
  });

  it("contains stagnation detection rule (2 iterations)", () => {
    expect(PIPELINE_RULES).toMatch(/plateaued.*2.*iteration|停滞検出.*2.*iteration/s);
  });
});

// ---------------------------------------------------------------------------
// TC-08: Excluded sections (Authority matrix etc.)
// ---------------------------------------------------------------------------
describe("TC-08: PIPELINE_RULES does NOT contain excluded sections", () => {
  it("does not contain Authority matrix", () => {
    expect(PIPELINE_RULES).not.toContain("Authority");
    expect(PIPELINE_RULES).not.toContain("authority");
  });

  it("does not contain 責務の競合ルール", () => {
    expect(PIPELINE_RULES).not.toContain("責務の競合ルール");
  });

  it("does not contain testing カテゴリの責務境界", () => {
    expect(PIPELINE_RULES).not.toContain("testing カテゴリの責務境界");
  });

  it("does not contain Output Contract", () => {
    expect(PIPELINE_RULES).not.toContain("Output Contract");
  });

  it("does not contain Skip / Status 報告", () => {
    expect(PIPELINE_RULES).not.toContain("Skip / Status");
    expect(PIPELINE_RULES).not.toContain("status: skipped");
  });

  it("does not contain 参照リンク (skills/ paths)", () => {
    expect(PIPELINE_RULES).not.toContain("skills/code-review");
    expect(PIPELINE_RULES).not.toContain("skills/spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-10: code-review-system.ts imports PIPELINE_RULES
// ---------------------------------------------------------------------------
describe("TC-10: CODE_REVIEW_SYSTEM_PROMPT contains PIPELINE_RULES content", () => {
  it("system prompt includes Severity section from PIPELINE_RULES", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("CRITICAL");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("HIGH");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("MEDIUM");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("LOW");
  });
});

// ---------------------------------------------------------------------------
// TC-11: code-review system prompt has PIPELINE_RULES expanded
// ---------------------------------------------------------------------------
describe("TC-11: code-review system prompt contains Pipeline Rules section", () => {
  it("contains Pipeline Rules section header", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("## Pipeline Rules");
  });

  it("contains content from PIPELINE_RULES", () => {
    // Verify that PIPELINE_RULES content is actually expanded in the prompt
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("承認阻止条件");
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("Convergence Trend");
  });
});

// ---------------------------------------------------------------------------
// TC-12: code-review-system.ts .claude/rules reference removed
// ---------------------------------------------------------------------------
describe("TC-12: code-review system prompt has no .claude/rules reference", () => {
  it("does not reference .claude/rules/review-standards.md", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain(".claude/rules/review-standards.md");
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain(".claude/rules");
  });
});

// ---------------------------------------------------------------------------
// TC-15: spec-review-system.ts imports PIPELINE_RULES
// ---------------------------------------------------------------------------
describe("TC-15: SPEC_REVIEW_SYSTEM_PROMPT contains PIPELINE_RULES content", () => {
  it("system prompt includes content from PIPELINE_RULES", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("CRITICAL");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("needs-fix");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("承認阻止条件");
  });
});

// ---------------------------------------------------------------------------
// TC-16: spec-review system prompt has PIPELINE_RULES expanded before Your Output
// ---------------------------------------------------------------------------
describe("TC-16: spec-review system prompt contains Pipeline Rules before Your Output", () => {
  it("contains Pipeline Rules section header", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("## Pipeline Rules");
  });

  it("Pipeline Rules section appears before Your Output section", () => {
    const pipelineRulesIdx = SPEC_REVIEW_SYSTEM_PROMPT.indexOf("## Pipeline Rules");
    const yourOutputIdx = SPEC_REVIEW_SYSTEM_PROMPT.indexOf("## Your Output");
    expect(pipelineRulesIdx).toBeGreaterThan(-1);
    expect(yourOutputIdx).toBeGreaterThan(-1);
    expect(pipelineRulesIdx).toBeLessThan(yourOutputIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-17: spec-review-system.ts review-standards.md severity definitions removed
// ---------------------------------------------------------------------------
describe("TC-17: spec-review system prompt has no review-standards.md severity definitions reference", () => {
  it("does not contain 'review-standards.md severity definitions'", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).not.toContain("review-standards.md severity definitions");
  });

  it("contains 'Pipeline Rules above' instead", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Pipeline Rules above");
  });
});

// ---------------------------------------------------------------------------
// TC-18: spec-review-system.ts inline Severity levels definition removed
// ---------------------------------------------------------------------------
describe("TC-18: spec-review system prompt has no inline Severity levels list", () => {
  it("does not contain 'Severity levels: CRITICAL, HIGH, MEDIUM, LOW'", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).not.toContain("Severity levels: CRITICAL, HIGH, MEDIUM, LOW");
  });
});
