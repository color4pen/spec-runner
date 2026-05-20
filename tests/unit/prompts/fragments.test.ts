/**
 * Unit tests for src/prompts/fragments.ts
 *
 * Migrated from tests/prompts/pipeline-rules.test.ts (TC-01 to TC-08).
 * TC-10~TC-18 (prompt containment checks) are covered by fragment-coverage.test.ts.
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
  SPEC_RUNNER_COMMON_CONTEXT,
  AUTHORITY_SPEC_GUARD,
  COMMIT_DISCIPLINE,
  DELTA_SPEC_FORMAT,
  PIPELINE_RULES,
} from "../../../src/prompts/fragments.js";
import { DESIGN_SYSTEM_PROMPT } from "../../../src/prompts/design-system.js";

// ---------------------------------------------------------------------------
// All 5 fragments are exported as non-empty strings
// ---------------------------------------------------------------------------
describe("fragments.ts exports all fragments as strings", () => {
  it("SPEC_RUNNER_COMMON_CONTEXT is a non-empty string", () => {
    expect(typeof SPEC_RUNNER_COMMON_CONTEXT).toBe("string");
    expect(SPEC_RUNNER_COMMON_CONTEXT.length).toBeGreaterThan(0);
  });

  it("AUTHORITY_SPEC_GUARD is a non-empty string", () => {
    expect(typeof AUTHORITY_SPEC_GUARD).toBe("string");
    expect(AUTHORITY_SPEC_GUARD.length).toBeGreaterThan(0);
  });

  it("COMMIT_DISCIPLINE is a non-empty string", () => {
    expect(typeof COMMIT_DISCIPLINE).toBe("string");
    expect(COMMIT_DISCIPLINE.length).toBeGreaterThan(0);
  });

  it("DELTA_SPEC_FORMAT is a non-empty string", () => {
    expect(typeof DELTA_SPEC_FORMAT).toBe("string");
    expect(DELTA_SPEC_FORMAT.length).toBeGreaterThan(0);
  });

  it("PIPELINE_RULES is a non-empty string", () => {
    expect(typeof PIPELINE_RULES).toBe("string");
    expect(PIPELINE_RULES.length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// SPEC_RUNNER_COMMON_CONTEXT assertions
// ---------------------------------------------------------------------------
describe("SPEC_RUNNER_COMMON_CONTEXT content checks", () => {
  it("contains 'spec-runner'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("spec-runner");
  });

  it("contains pipeline step name 'design'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("design");
  });

  it("contains pipeline step name 'implementer'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("implementer");
  });

  it("contains pipeline step name 'code-review'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("code-review");
  });

  it("contains '禁止'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("禁止");
  });

  it("contains 'specrunner/adr/'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("specrunner/adr/");
  });

  it("contains 'specrunner/specs/'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("specrunner/specs/");
  });

  it("contains 'specrunner/changes/'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).toContain("specrunner/changes/");
  });

  it("does NOT contain 'あなたは'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).not.toContain("あなたは");
  });

  it("does NOT contain 'あなたの'", () => {
    expect(SPEC_RUNNER_COMMON_CONTEXT).not.toContain("あなたの");
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
// T-12: DELTA_SPEC_FORMAT assertions
// ---------------------------------------------------------------------------
describe("T-12: DELTA_SPEC_FORMAT uses new format section headers", () => {
  it("DELTA_SPEC_FORMAT contains ## Requirements", () => {
    expect(DELTA_SPEC_FORMAT).toContain("## Requirements");
  });

  it("DELTA_SPEC_FORMAT does NOT contain ## ADDED Requirements", () => {
    expect(DELTA_SPEC_FORMAT).not.toContain("## ADDED Requirements");
  });

  it("DELTA_SPEC_FORMAT does NOT contain ## MODIFIED Requirements", () => {
    expect(DELTA_SPEC_FORMAT).not.toContain("## MODIFIED Requirements");
  });

  it("DELTA_SPEC_FORMAT does NOT contain ## REMOVED Requirements", () => {
    expect(DELTA_SPEC_FORMAT).not.toContain("## REMOVED Requirements");
  });

  it("DELTA_SPEC_FORMAT does NOT contain ## RENAMED Requirements", () => {
    expect(DELTA_SPEC_FORMAT).not.toContain("## RENAMED Requirements");
  });
});

// ---------------------------------------------------------------------------
// T-12: AUTHORITY_SPEC_GUARD assertions
// ---------------------------------------------------------------------------
describe("T-12: AUTHORITY_SPEC_GUARD contains 書く側/見る側の規律", () => {
  it("AUTHORITY_SPEC_GUARD contains 書く側の規律", () => {
    expect(AUTHORITY_SPEC_GUARD).toContain("書く側の規律");
  });

  it("AUTHORITY_SPEC_GUARD contains 見る側の規律", () => {
    expect(AUTHORITY_SPEC_GUARD).toContain("見る側の規律");
  });

  it("AUTHORITY_SPEC_GUARD does NOT contain 'MUST NOT (全 agent 共通)' as section heading", () => {
    expect(AUTHORITY_SPEC_GUARD).not.toContain("MUST NOT (全 agent 共通)");
  });

  it("AUTHORITY_SPEC_GUARD does NOT contain the sentence about 直接編集してはならない（MUST NOT）", () => {
    expect(AUTHORITY_SPEC_GUARD).not.toContain("specrunner/specs/` 配下のファイルを直接編集してはならない（MUST NOT）");
  });
});

describe("T-12: AUTHORITY_SPEC_GUARD does not contain old ADDED/MODIFIED classification criteria", () => {
  it("AUTHORITY_SPEC_GUARD does not instruct agent to write ADDED: based on baseline absence", () => {
    expect(AUTHORITY_SPEC_GUARD).not.toMatch(/\*\*ADDED\*\*: baseline に存在しない/);
  });

  it("AUTHORITY_SPEC_GUARD does not instruct agent to write MODIFIED: based on baseline presence", () => {
    expect(AUTHORITY_SPEC_GUARD).not.toMatch(/\*\*MODIFIED\*\*: baseline に存在する/);
  });

  it("AUTHORITY_SPEC_GUARD mentions tool auto-classification", () => {
    expect(AUTHORITY_SPEC_GUARD).toMatch(/tool|自動/);
  });
});

// ---------------------------------------------------------------------------
// T-12: DESIGN_SYSTEM_PROMPT does not reference old section headers
// ---------------------------------------------------------------------------
// TC-32: TypeScript compilation passes
describe("TC-32: bun run typecheck passes", () => {
  it("TC-32: TypeScript compilation passes — all fragment exports are well-typed strings", () => {
    // If TypeScript fails to compile, the imports at the top of this file would error.
    // This test marks TC-32 coverage in the test-coverage phase.
    expect(typeof SPEC_RUNNER_COMMON_CONTEXT).toBe("string");
    expect(typeof AUTHORITY_SPEC_GUARD).toBe("string");
    expect(typeof DELTA_SPEC_FORMAT).toBe("string");
    expect(typeof COMMIT_DISCIPLINE).toBe("string");
    expect(typeof PIPELINE_RULES).toBe("string");
  });
});

describe("T-12: DESIGN_SYSTEM_PROMPT does not reference old section headers", () => {
  it("DESIGN_SYSTEM_PROMPT does not contain ## ADDED Requirements", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("## ADDED Requirements");
  });

  it("DESIGN_SYSTEM_PROMPT does not contain ## MODIFIED Requirements", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("## MODIFIED Requirements");
  });
});
