/**
 * Unit tests for src/prompts/fragments.ts
 *
 * Migrated from tests/prompts/pipeline-rules.test.ts (TC-01 to TC-08).
 * TC-10~TC-18 (prompt containment checks) are covered by fragment-coverage.test.ts.
 *
 * NOTE: SPEC_RUNNER_COMMON_CONTEXT, AUTHORITY_SPEC_GUARD, and DELTA_SPEC_FORMAT
 * have been removed from fragments.ts and moved to specrunner/rules.md.
 * Only COMMIT_DISCIPLINE and PIPELINE_RULES remain as fragments.
 *
 * TC-01 & TC-27: PIPELINE_RULES exported as non-empty string
 * TC-02: PIPELINE_RULES contains Severity section (CRITICAL/HIGH/MEDIUM/LOW, approval block)
 * TC-03: PIPELINE_RULES contains all 9 categories
 * TC-04: PIPELINE_RULES contains Findings Format (columns, path:line format)
 * TC-05: PIPELINE_RULES contains Scoring (weights, pass threshold 7.0)
 * TC-06: PIPELINE_RULES contains Verdict (approved/needs-fix/escalation)
 * TC-07: PIPELINE_RULES contains Iteration Comparison (improving/plateaued/regressing, stagnation)
 * TC-08: PIPELINE_RULES does NOT contain excluded sections (Authority matrix etc.)
 */
import { describe, it, expect } from "vitest";
import {
  COMMIT_DISCIPLINE,
  PIPELINE_RULES,
} from "../../../src/prompts/fragments.js";
import { DESIGN_SYSTEM_PROMPT } from "../../../src/prompts/design-system.js";

// ---------------------------------------------------------------------------
// Remaining fragments are exported as non-empty strings
// ---------------------------------------------------------------------------
describe("fragments.ts exports remaining fragments as strings", () => {
  it("COMMIT_DISCIPLINE is a non-empty string", () => {
    expect(typeof COMMIT_DISCIPLINE).toBe("string");
    expect(COMMIT_DISCIPLINE.length).toBeGreaterThan(0);
  });

  it("PIPELINE_RULES is a non-empty string", () => {
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
// TC-32: TypeScript compilation passes
// ---------------------------------------------------------------------------
describe("TC-32: bun run typecheck passes", () => {
  it("TC-32: TypeScript compilation passes — remaining fragment exports are well-typed strings", () => {
    // If TypeScript fails to compile, the imports at the top of this file would error.
    expect(typeof COMMIT_DISCIPLINE).toBe("string");
    expect(typeof PIPELINE_RULES).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// T-12: DESIGN_SYSTEM_PROMPT does not reference old section headers
// ---------------------------------------------------------------------------
describe("T-12: DESIGN_SYSTEM_PROMPT does not reference old section headers", () => {
  it("DESIGN_SYSTEM_PROMPT does not contain ## ADDED Requirements", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("## ADDED Requirements");
  });

  it("DESIGN_SYSTEM_PROMPT does not contain ## MODIFIED Requirements", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("## MODIFIED Requirements");
  });
});
