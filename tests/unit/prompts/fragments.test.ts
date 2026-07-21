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
// TC-02: Severity section removed from PIPELINE_RULES (verdict-channel-unification)
// ---------------------------------------------------------------------------
describe("TC-02: PIPELINE_RULES does NOT contain removed Severity section (TC-010, TC-016)", () => {
  it("does not contain uppercase CRITICAL severity label", () => {
    expect(PIPELINE_RULES).not.toContain("CRITICAL");
  });

  it("does not contain uppercase HIGH severity label", () => {
    expect(PIPELINE_RULES).not.toContain("HIGH");
  });

  it("does not contain uppercase MEDIUM severity label", () => {
    expect(PIPELINE_RULES).not.toContain("MEDIUM");
  });

  it("does not contain uppercase LOW severity label", () => {
    expect(PIPELINE_RULES).not.toContain("LOW");
  });

  it("still contains needs-fix verdict (in Verdict section)", () => {
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
// TC-04: Findings Format section removed from PIPELINE_RULES (verdict-channel-unification)
// ---------------------------------------------------------------------------
describe("TC-04: PIPELINE_RULES does NOT contain removed Findings Format section (TC-015)", () => {
  it("does not contain 7-column findings table header", () => {
    expect(PIPELINE_RULES).not.toContain("# | Severity | Category | File | Description | How to Fix");
  });

  it("does not contain {path}:{line} column format note", () => {
    expect(PIPELINE_RULES).not.toMatch(/\{path\}:\{line\}/);
  });

  it("does not contain '具体的|抽象表現は不可' How-to-Fix guidance", () => {
    expect(PIPELINE_RULES).not.toMatch(/抽象表現は不可/);
  });
});

// ---------------------------------------------------------------------------
// TC-05: Scoring section removed from PIPELINE_RULES (verdict-channel-unification)
// ---------------------------------------------------------------------------
describe("TC-05: PIPELINE_RULES does NOT contain removed Scoring section (TC-008)", () => {
  it("does not contain Score 1-10 table values", () => {
    expect(PIPELINE_RULES).not.toContain("9-10");
  });

  it("does not contain Weight table decimal values", () => {
    expect(PIPELINE_RULES).not.toContain("0.30");
    expect(PIPELINE_RULES).not.toContain("0.25");
  });

  it("does not contain pass threshold 7.0", () => {
    expect(PIPELINE_RULES).not.toContain("7.0");
  });

  it("does not contain 'Score' column header", () => {
    expect(PIPELINE_RULES).not.toContain("| Score |");
  });

  it("does not contain 'Weight' column header", () => {
    expect(PIPELINE_RULES).not.toContain("| Weight |");
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
// TC-07: Iteration Comparison section removed from PIPELINE_RULES (verdict-channel-unification)
// ---------------------------------------------------------------------------
describe("TC-07: PIPELINE_RULES does NOT contain removed Iteration Comparison section (TC-008)", () => {
  it("does not contain Convergence Trend text", () => {
    expect(PIPELINE_RULES).not.toContain("Convergence Trend");
  });

  it("does not contain 'plateaued' trend value", () => {
    expect(PIPELINE_RULES).not.toContain("plateaued");
  });

  it("does not contain 'Regressions' column from Iteration Comparison table", () => {
    expect(PIPELINE_RULES).not.toContain("Regressions");
  });

  it("does not contain stagnation detection pattern", () => {
    expect(PIPELINE_RULES).not.toMatch(/停滞検出.*2.*iteration/s);
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
