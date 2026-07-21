/**
 * Drift-guard tests for step-prompt-skeleton-restructure.
 *
 * Verifies that:
 * TC-001: All 15 system prompts contain the 5-section headings (Question/Contract/Method/Evidence/Completion)
 * TC-002: No independent stage tables exist in any prompt output
 * TC-003: Stage-bearing prompts embed PIPELINE_MAP
 * TC-004: All agent prompts contain EVIDENCE_DISCIPLINE
 * TC-005: All agent prompts contain CAUSE_CLASSIFICATION
 * TC-006: build-fixer and code-fixer share COVERAGE_GATE_INTEGRITY (single source)
 * TC-007: No architecture/ references in prompt outputs
 * TC-008: rules.ts has no empty 共通禁止: section
 * TC-009: rules.ts step enumeration is derived from PIPELINE_MAP
 * TC-010: All producer/fixer prompts declare write-set in Contract section
 * TC-011: Result templates have no verdict derivation criteria
 * TC-012: TEST_CASES template has no Category/Priority criteria tables
 * TC-013: SPEC_EXEMPT_NOTE has no downstream reviewer action instructions
 * TC-014: Routing/gate invariants are preserved (judge-verdict behavior unchanged)
 * TC-015: Judge prompts contain severity definition constants
 * TC-016: Judge prompts do not require writing verdict lines
 * TC-017: Producer prompts contain COMPLETION_DIRECTIVE
 *
 * All tests are intentionally RED until the implementer completes T-01 through T-10.
 * The import of PIPELINE_MAP / EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION / COVERAGE_GATE_INTEGRITY
 * will fail until those are created, making the entire suite fail at module load.
 */
import { describe, it, expect } from "vitest";

// ── New leaf module (does not exist yet → import will fail, all tests red) ──
import { PIPELINE_MAP } from "../pipeline-map.js";

// ── New fragment constants (not yet exported from fragments.ts) ──
import {
  EVIDENCE_DISCIPLINE,
  CAUSE_CLASSIFICATION,
  COVERAGE_GATE_INTEGRITY,
  COMPLETION_DIRECTIVE,
} from "../fragments.js";

// ── Existing modules ──
import { RULES_MD_CONTENT } from "../rules.js";
import {
  SEVERITY_DEFINITION,
  REQUEST_REVIEW_SEVERITY_DEFINITION,
} from "../judge-rules.js";

// ── System prompt exports (one per agent step) ──
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../request-review-system.js";
import { DESIGN_SYSTEM_PROMPT } from "../design-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../spec-review-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../spec-fixer-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../test-case-gen-system.js";
import { TEST_MATERIALIZE_SYSTEM_PROMPT } from "../test-materialize-system.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../implementer-system.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../build-fixer-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../code-review-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../code-fixer-system.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../conformance-system.js";
import { REGRESSION_GATE_SYSTEM_PROMPT } from "../regression-gate-system.js";
import { buildCustomReviewerSystemPrompt } from "../custom-reviewer-system.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../adr-gen-system.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../request-generate-system.js";

// ── Templates ──
import {
  REQUEST_REVIEW_RESULT_TEMPLATE,
  SPEC_REVIEW_RESULT_TEMPLATE,
  REVIEW_FEEDBACK_TEMPLATE,
  CONFORMANCE_RESULT_TEMPLATE,
  TEST_CASES_TEMPLATE,
  SPEC_EXEMPT_NOTE,
} from "../../templates/step-output-templates.js";

import type { ReviewerSnapshot } from "../../kernel/reviewer-snapshot.js";

// ============================================================================
// Helpers
// ============================================================================

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

/**
 * All 15 agent step system prompt outputs.
 * The list must cover exactly:
 *   request-review / design / spec-review / spec-fixer / test-case-gen / test-materialize /
 *   implementer / build-fixer / code-review / code-fixer / conformance / regression-gate /
 *   custom-reviewer / adr-gen / request-generate
 */
const ALL_15_AGENT_PROMPTS: Array<[string, string]> = [
  ["REQUEST_REVIEW_SYSTEM_PROMPT", REQUEST_REVIEW_SYSTEM_PROMPT],
  ["DESIGN_SYSTEM_PROMPT", DESIGN_SYSTEM_PROMPT],
  ["SPEC_REVIEW_SYSTEM_PROMPT", SPEC_REVIEW_SYSTEM_PROMPT],
  ["SPEC_FIXER_SYSTEM_PROMPT", SPEC_FIXER_SYSTEM_PROMPT],
  ["TEST_CASE_GEN_SYSTEM_PROMPT", TEST_CASE_GEN_SYSTEM_PROMPT],
  ["TEST_MATERIALIZE_SYSTEM_PROMPT", TEST_MATERIALIZE_SYSTEM_PROMPT],
  ["IMPLEMENTER_SYSTEM_PROMPT", IMPLEMENTER_SYSTEM_PROMPT],
  ["BUILD_FIXER_SYSTEM_PROMPT", BUILD_FIXER_SYSTEM_PROMPT],
  ["CODE_REVIEW_SYSTEM_PROMPT", CODE_REVIEW_SYSTEM_PROMPT],
  ["CODE_FIXER_SYSTEM_PROMPT", CODE_FIXER_SYSTEM_PROMPT],
  ["CONFORMANCE_SYSTEM_PROMPT", CONFORMANCE_SYSTEM_PROMPT],
  ["REGRESSION_GATE_SYSTEM_PROMPT", REGRESSION_GATE_SYSTEM_PROMPT],
  ["buildCustomReviewerSystemPrompt()", buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot())],
  ["ADR_GEN_SYSTEM_PROMPT", ADR_GEN_SYSTEM_PROMPT],
  ["REQUEST_GENERATE_SYSTEM_PROMPT", REQUEST_GENERATE_SYSTEM_PROMPT],
];

/** Producer steps: generate output artifacts (design / test-case-gen / test-materialize / implementer / adr-gen) */
const PRODUCER_PROMPTS: Array<[string, string]> = [
  ["DESIGN_SYSTEM_PROMPT", DESIGN_SYSTEM_PROMPT],
  ["TEST_CASE_GEN_SYSTEM_PROMPT", TEST_CASE_GEN_SYSTEM_PROMPT],
  ["TEST_MATERIALIZE_SYSTEM_PROMPT", TEST_MATERIALIZE_SYSTEM_PROMPT],
  ["IMPLEMENTER_SYSTEM_PROMPT", IMPLEMENTER_SYSTEM_PROMPT],
  ["ADR_GEN_SYSTEM_PROMPT", ADR_GEN_SYSTEM_PROMPT],
];

/** Fixer steps: resolve findings / failures (spec-fixer / code-fixer / build-fixer) */
const FIXER_PROMPTS: Array<[string, string]> = [
  ["SPEC_FIXER_SYSTEM_PROMPT", SPEC_FIXER_SYSTEM_PROMPT],
  ["CODE_FIXER_SYSTEM_PROMPT", CODE_FIXER_SYSTEM_PROMPT],
  ["BUILD_FIXER_SYSTEM_PROMPT", BUILD_FIXER_SYSTEM_PROMPT],
];

/** All producer and fixer steps that must declare a write-set in Contract */
const PRODUCER_AND_FIXER_PROMPTS = [...PRODUCER_PROMPTS, ...FIXER_PROMPTS];

/** All 8 producer prompts (T-07 / TC-017: must contain COMPLETION_DIRECTIVE) */
const PRODUCER_8_PROMPTS: Array<[string, string]> = [
  ...PRODUCER_PROMPTS,
  ...FIXER_PROMPTS,
];

/** Judge prompts: evaluate and produce a verdict (6 steps) */
const JUDGE_PROMPTS: Array<[string, string]> = [
  ["REQUEST_REVIEW_SYSTEM_PROMPT", REQUEST_REVIEW_SYSTEM_PROMPT],
  ["SPEC_REVIEW_SYSTEM_PROMPT", SPEC_REVIEW_SYSTEM_PROMPT],
  ["CODE_REVIEW_SYSTEM_PROMPT", CODE_REVIEW_SYSTEM_PROMPT],
  ["CONFORMANCE_SYSTEM_PROMPT", CONFORMANCE_SYSTEM_PROMPT],
  ["REGRESSION_GATE_SYSTEM_PROMPT", REGRESSION_GATE_SYSTEM_PROMPT],
  ["buildCustomReviewerSystemPrompt()", buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot())],
];

/**
 * Stage table markers that must not appear in any prompt output.
 * These indicate a hand-written stage table independent of PIPELINE_MAP.
 */
const STAGE_TABLE_MARKERS = [
  "Pipeline Position",
  "stage 1:",
  "stage 2:",
  "stage 3:",
  "stage 4:",
  "stage 5:",
  "stage 6:",
];

/**
 * Verdict output instruction patterns that judge prompts must NOT contain.
 * (Inherited from verdict-channel-unification TC-001 prohibition patterns)
 */
const VERDICT_OUTPUT_INSTRUCTION_PATTERNS = [
  "required for machine parsing",
  "The file MUST contain a verdict line",
  "The result file MUST contain a verdict line",
  "The verdict line MUST be exactly",
];

/**
 * Extract the text of a named section (from its heading to the next ## heading).
 * Returns undefined if the section heading is not found.
 */
function extractSection(prompt: string, sectionName: string): string | undefined {
  const headingPattern = new RegExp(`^## ${sectionName}\\s*$`, "m");
  const match = headingPattern.exec(prompt);
  if (!match || match.index === undefined) return undefined;
  const afterHeading = prompt.slice(match.index);
  // find next ## heading
  const nextHeadingMatch = /^## \S/m.exec(afterHeading.slice(1));
  if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
    return afterHeading.slice(0, nextHeadingMatch.index + 1);
  }
  return afterHeading;
}

/**
 * Check that the Contract section of a prompt declares a write-set.
 * Write-set is declared by the presence of "write-set" or "編集可能" text.
 */
function contractHasWriteSet(prompt: string): boolean {
  const contractSection = extractSection(prompt, "Contract");
  if (!contractSection) return false;
  return /write-set|編集可能/.test(contractSection);
}

// ============================================================================
// TC-001: 各 system prompt 出力が 5 節見出しを含む
// Source: spec.md > Requirement: 全 agent step system prompt は 5 部構成の共通骨格に従う
//         > Scenario: 各 system prompt 出力が 5 節見出しを含む
// ============================================================================

describe("TC-001: 各 system prompt 出力が 5 節見出しを含む", () => {
  const REQUIRED_HEADINGS = [
    "## Question",
    "## Contract",
    "## Method",
    "## Evidence",
    "## Completion",
  ];

  for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
    for (const heading of REQUIRED_HEADINGS) {
      it(`TC-001: ${name} contains "${heading}"`, () => {
        expect(prompt).toContain(heading);
      });
    }

    it(`TC-001: ${name} headings appear in correct order (Question→Contract→Method→Evidence→Completion)`, () => {
      const indices = REQUIRED_HEADINGS.map((h) => prompt.indexOf(h));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i], `"${REQUIRED_HEADINGS[i]}" must come after "${REQUIRED_HEADINGS[i - 1]}"`).toBeGreaterThan(indices[i - 1]);
      }
    });
  }
});

// ============================================================================
// TC-002: prompt 出力に独立した stage 表が存在しない
// Source: spec.md > Requirement: pipeline stage の列挙は単一ソース PIPELINE_MAP から供給される
//         > Scenario: prompt 出力に独立した stage 表が存在しない
// ============================================================================

describe("TC-002: prompt 出力に独立した stage 表が存在しない", () => {
  for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
    for (const marker of STAGE_TABLE_MARKERS) {
      it(`TC-002: ${name} does not contain stage table marker "${marker}"`, () => {
        expect(prompt).not.toContain(marker);
      });
    }
  }
});

// ============================================================================
// TC-003: stage 一覧は PIPELINE_MAP を埋め込む
// Source: spec.md > Requirement: pipeline stage の列挙は単一ソース PIPELINE_MAP から供給される
//         > Scenario: stage 一覧は PIPELINE_MAP を埋め込む
// ============================================================================

describe("TC-003: stage 一覧は PIPELINE_MAP を埋め込む", () => {
  it("TC-003: DESIGN_SYSTEM_PROMPT contains PIPELINE_MAP", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain(PIPELINE_MAP);
  });

  it("TC-003: IMPLEMENTER_SYSTEM_PROMPT contains PIPELINE_MAP", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain(PIPELINE_MAP);
  });

  it("TC-003: TEST_MATERIALIZE_SYSTEM_PROMPT contains PIPELINE_MAP", () => {
    expect(TEST_MATERIALIZE_SYSTEM_PROMPT).toContain(PIPELINE_MAP);
  });

  it("TC-003: RULES_MD_CONTENT contains PIPELINE_MAP (step enumeration single source)", () => {
    expect(RULES_MD_CONTENT).toContain(PIPELINE_MAP);
  });
});

// ============================================================================
// TC-004: 全 agent prompt が EVIDENCE_DISCIPLINE を含む
// Source: spec.md > Requirement: EVIDENCE_DISCIPLINE は全 agent step の system prompt に埋め込まれる
//         > Scenario: 全 agent prompt が EVIDENCE_DISCIPLINE を含む
// ============================================================================

describe("TC-004: 全 agent prompt が EVIDENCE_DISCIPLINE を含む", () => {
  for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
    it(`TC-004: ${name} contains EVIDENCE_DISCIPLINE`, () => {
      expect(prompt).toContain(EVIDENCE_DISCIPLINE);
    });
  }
});

// ============================================================================
// TC-005: 全 agent prompt が CAUSE_CLASSIFICATION を含む
// Source: spec.md > Requirement: 失敗・escalation・decision-needed の報告に原因分類が要求される
//         > Scenario: 全 agent prompt が CAUSE_CLASSIFICATION を含む
// ============================================================================

describe("TC-005: 全 agent prompt が CAUSE_CLASSIFICATION を含む", () => {
  for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
    it(`TC-005: ${name} contains CAUSE_CLASSIFICATION`, () => {
      expect(prompt).toContain(CAUSE_CLASSIFICATION);
    });
  }

  it("TC-005: CAUSE_CLASSIFICATION contains request-gap identifier", () => {
    expect(CAUSE_CLASSIFICATION).toContain("request-gap");
  });

  it("TC-005: CAUSE_CLASSIFICATION contains derivation-gap identifier", () => {
    expect(CAUSE_CLASSIFICATION).toContain("derivation-gap");
  });

  it("TC-005: CAUSE_CLASSIFICATION contains implementation-defect identifier", () => {
    expect(CAUSE_CLASSIFICATION).toContain("implementation-defect");
  });

  it("TC-005: CAUSE_CLASSIFICATION contains harness-defect identifier", () => {
    expect(CAUSE_CLASSIFICATION).toContain("harness-defect");
  });

  it("TC-005: CAUSE_CLASSIFICATION contains operational identifier", () => {
    expect(CAUSE_CLASSIFICATION).toContain("operational");
  });
});

// ============================================================================
// TC-006: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む
// Source: spec.md > Requirement: coverage gate 回避禁止は単一ソースから供給される
//         > Scenario: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む
// ============================================================================

describe("TC-006: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む", () => {
  it("TC-006: BUILD_FIXER_SYSTEM_PROMPT contains COVERAGE_GATE_INTEGRITY", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain(COVERAGE_GATE_INTEGRITY);
  });

  it("TC-006: CODE_FIXER_SYSTEM_PROMPT contains COVERAGE_GATE_INTEGRITY", () => {
    expect(CODE_FIXER_SYSTEM_PROMPT).toContain(COVERAGE_GATE_INTEGRITY);
  });
});

// ============================================================================
// TC-007: prompt 出力に architecture/ 参照が存在しない
// Source: spec.md > Requirement: CLI 組み込み prompt は repo 固有資源を名指ししない
//         > Scenario: prompt 出力に architecture/ 参照が存在しない
// ============================================================================

describe("TC-007: prompt 出力に architecture/ 参照が存在しない", () => {
  for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
    it(`TC-007: ${name} does not contain "architecture/"`, () => {
      expect(prompt).not.toContain("architecture/");
    });
  }
});

// ============================================================================
// TC-008: rules.ts に空の共通禁止節が存在しない
// Source: spec.md > Requirement: rules.ts は現行 step 集合を反映し空節を持たない
//         > Scenario: rules.ts に空の共通禁止節が存在しない
// ============================================================================

describe("TC-008: rules.ts に空の共通禁止節が存在しない", () => {
  it('TC-008: RULES_MD_CONTENT does not contain empty "共通禁止:" heading (heading with no body)', () => {
    // The empty section looks like "共通禁止:\n\n---" — heading followed by a rule separator or another heading
    // without any content. Check for the specific empty pattern.
    expect(RULES_MD_CONTENT).not.toMatch(/共通禁止:\s*\n\s*\n\s*---/);
  });

  it("TC-008: RULES_MD_CONTENT does not contain bare 共通禁止: heading followed immediately by section separator", () => {
    // Matches "共通禁止:\n\n" followed by "---" (empty body)
    expect(RULES_MD_CONTENT).not.toMatch(/共通禁止:\s*?\n\n---/);
  });
});

// ============================================================================
// TC-009: rules.ts の step 列挙が PIPELINE_MAP と一致する
// Source: spec.md > Requirement: rules.ts は現行 step 集合を反映し空節を持たない
//         > Scenario: rules.ts の step 列挙が PIPELINE_MAP と一致する
// ============================================================================

describe("TC-009: rules.ts の step 列挙が PIPELINE_MAP と一致する", () => {
  it("TC-009: RULES_MD_CONTENT contains PIPELINE_MAP as the step enumeration source", () => {
    expect(RULES_MD_CONTENT).toContain(PIPELINE_MAP);
  });
});

// ============================================================================
// TC-010: 全 producer / fixer prompt が write-set を宣言する
// Source: spec.md > Requirement: producer / fixer / judge の Contract 節は write-set を宣言する
//         > Scenario: 全 producer / fixer prompt が write-set を宣言する
// ============================================================================

describe("TC-010: 全 producer / fixer prompt が write-set を宣言する", () => {
  for (const [name, prompt] of PRODUCER_AND_FIXER_PROMPTS) {
    it(`TC-010: ${name} Contract section declares write-set`, () => {
      expect(contractHasWriteSet(prompt), `${name}: Contract section must contain "write-set" or "編集可能"`).toBe(true);
    });
  }
});

// ============================================================================
// TC-011: result template に verdict 導出の判定基準が存在しない
// Source: spec.md > Requirement: output template は出力の形式のみを所有する
//         > Scenario: result template に verdict 導出の判定基準が存在しない
// ============================================================================

describe("TC-011: result template に verdict 導出の判定基準が存在しない", () => {
  const VERDICT_DERIVATION_PATTERNS = [
    "CLI の判定:",
    "critical|high → needs-fix",
    "decision-needed → escalation",
    "→ needs-fix",
    "→ escalation",
    "→ approved",
  ];

  const FOUR_RESULT_TEMPLATES: Array<[string, string]> = [
    ["REQUEST_REVIEW_RESULT_TEMPLATE", REQUEST_REVIEW_RESULT_TEMPLATE],
    ["SPEC_REVIEW_RESULT_TEMPLATE", SPEC_REVIEW_RESULT_TEMPLATE],
    ["REVIEW_FEEDBACK_TEMPLATE", REVIEW_FEEDBACK_TEMPLATE],
    ["CONFORMANCE_RESULT_TEMPLATE", CONFORMANCE_RESULT_TEMPLATE],
  ];

  for (const [name, template] of FOUR_RESULT_TEMPLATES) {
    for (const pattern of VERDICT_DERIVATION_PATTERNS) {
      it(`TC-011: ${name} does not contain verdict derivation pattern "${pattern}"`, () => {
        expect(template).not.toContain(pattern);
      });
    }
  }

  // Evidence report required sections must be preserved
  it("TC-011: REQUEST_REVIEW_RESULT_TEMPLATE preserves '## 検証した項目'", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-011: REQUEST_REVIEW_RESULT_TEMPLATE preserves '## 検証できなかった項目'", () => {
    expect(REQUEST_REVIEW_RESULT_TEMPLATE).toContain("## 検証できなかった項目");
  });

  it("TC-011: SPEC_REVIEW_RESULT_TEMPLATE preserves '## 検証した項目'", () => {
    expect(SPEC_REVIEW_RESULT_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-011: REVIEW_FEEDBACK_TEMPLATE preserves '## 検証した項目'", () => {
    expect(REVIEW_FEEDBACK_TEMPLATE).toContain("## 検証した項目");
  });

  it("TC-011: CONFORMANCE_RESULT_TEMPLATE preserves '## 検証した項目'", () => {
    expect(CONFORMANCE_RESULT_TEMPLATE).toContain("## 検証した項目");
  });
});

// ============================================================================
// TC-012: TEST_CASES template に Category / Priority 判定基準表が存在しない
// Source: spec.md > Requirement: output template は出力の形式のみを所有する
//         > Scenario: TEST_CASES template に Category / Priority 判定基準表が存在しない
// ============================================================================

describe("TC-012: TEST_CASES template に Category / Priority 判定基準表が存在しない", () => {
  it("TC-012: TEST_CASES_TEMPLATE does not contain 'Category determination:'", () => {
    expect(TEST_CASES_TEMPLATE).not.toContain("Category determination:");
  });

  it("TC-012: TEST_CASES_TEMPLATE does not contain 'Priority determination:'", () => {
    expect(TEST_CASES_TEMPLATE).not.toContain("Priority determination:");
  });

  it("TC-012: TEST_CASES_TEMPLATE does not contain 'result determination:'", () => {
    expect(TEST_CASES_TEMPLATE).not.toContain("result determination:");
  });

  // Form requirements (TC heading format / Summary anchor / Result anchor) must be preserved
  it("TC-012: TEST_CASES_TEMPLATE preserves TC heading format '### TC-{NNN}'", () => {
    expect(TEST_CASES_TEMPLATE).toContain("TC-{NNN}");
  });

  it("TC-012: TEST_CASES_TEMPLATE preserves '## Summary' anchor", () => {
    expect(TEST_CASES_TEMPLATE).toContain("## Summary");
  });

  it("TC-012: TEST_CASES_TEMPLATE preserves required column names (Category / Priority / Source)", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Category");
    expect(TEST_CASES_TEMPLATE).toContain("Priority");
    expect(TEST_CASES_TEMPLATE).toContain("Source");
  });
});

// ============================================================================
// TC-013: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない
// Source: spec.md > Requirement: output template は出力の形式のみを所有する
//         > Scenario: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない
// ============================================================================

describe("TC-013: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない", () => {
  it("TC-013: SPEC_EXEMPT_NOTE does not contain 'Downstream reviewers'", () => {
    expect(SPEC_EXEMPT_NOTE).not.toContain("Downstream reviewers");
  });

  it("TC-013: SPEC_EXEMPT_NOTE does not contain downstream reviewer action instructions (vacuously satisfied directive)", () => {
    // The downstream reviewer behavior is handled by each reviewer's own system prompt.
    // The note should only contain the marker and a human-readable explanation.
    expect(SPEC_EXEMPT_NOTE).not.toContain("このファイルを vacuously satisfied");
  });

  it("TC-013: SPEC_EXEMPT_NOTE does not contain reviewer finding prohibition instruction", () => {
    expect(SPEC_EXEMPT_NOTE).not.toContain("finding（non-conformity）にしないこと");
  });

  // SPEC_EXEMPT_MARKER must be preserved in the note
  it("TC-013: SPEC_EXEMPT_NOTE contains SPEC_EXEMPT_MARKER", () => {
    expect(SPEC_EXEMPT_NOTE).toContain("SPEC-EXEMPT");
  });
});

// ============================================================================
// TC-014: 判定導出・executor・output gate の既存テストが無改変で green
// Source: spec.md > Requirement: 骨格再構成は routing / gate 挙動を変えない
//         > Scenario: 判定導出・executor・output gate の既存テストが無改変で green
// ============================================================================

describe("TC-014: routing / gate 挙動不変の証明 — judge-verdict invariants", () => {
  // These tests verify that the judge-verdict derivation logic is unchanged.
  // If the skeleton restructure accidentally changes these imports or the logic,
  // the following basic invariants would break.
  //
  // The full test coverage lives in judge-verdict.test.ts and
  // verdict-channel-unification.test.ts, which must remain green without modification.

  it("TC-014: SEVERITY_DEFINITION is a non-empty string (constant preserved)", () => {
    expect(SEVERITY_DEFINITION).toBeTruthy();
    expect(typeof SEVERITY_DEFINITION).toBe("string");
    expect(SEVERITY_DEFINITION.length).toBeGreaterThan(0);
  });

  it("TC-014: REQUEST_REVIEW_SEVERITY_DEFINITION is a non-empty string (constant preserved)", () => {
    expect(REQUEST_REVIEW_SEVERITY_DEFINITION).toBeTruthy();
    expect(typeof REQUEST_REVIEW_SEVERITY_DEFINITION).toBe("string");
    expect(REQUEST_REVIEW_SEVERITY_DEFINITION.length).toBeGreaterThan(0);
  });

  it("TC-014: SEVERITY_DEFINITION contains critical severity marker", () => {
    expect(SEVERITY_DEFINITION).toContain("critical");
  });

  it("TC-014: SEVERITY_DEFINITION contains high severity marker", () => {
    expect(SEVERITY_DEFINITION).toContain("high");
  });

  it("TC-014: prompt exports are all non-empty strings (module integrity)", () => {
    for (const [name, prompt] of ALL_15_AGENT_PROMPTS) {
      expect(prompt, `${name} must be a non-empty string`).toBeTruthy();
      expect(typeof prompt, `${name} must be a string`).toBe("string");
    }
  });
});

// ============================================================================
// TC-015: judge prompt が severity 定義定数を保持する
// Source: design.md > D3 / tasks.md > T-05 Acceptance Criteria
// ============================================================================

describe("TC-015: judge prompt が severity 定義定数を保持する", () => {
  it("TC-015: REQUEST_REVIEW_SYSTEM_PROMPT contains REQUEST_REVIEW_SEVERITY_DEFINITION", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain(REQUEST_REVIEW_SEVERITY_DEFINITION);
  });

  it("TC-015: SPEC_REVIEW_SYSTEM_PROMPT contains SEVERITY_DEFINITION", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION);
  });

  it("TC-015: CODE_REVIEW_SYSTEM_PROMPT contains SEVERITY_DEFINITION", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION);
  });

  it("TC-015: CONFORMANCE_SYSTEM_PROMPT contains SEVERITY_DEFINITION", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION);
  });

  it("TC-015: REGRESSION_GATE_SYSTEM_PROMPT contains SEVERITY_DEFINITION", () => {
    expect(REGRESSION_GATE_SYSTEM_PROMPT).toContain(SEVERITY_DEFINITION);
  });

  it("TC-015: buildCustomReviewerSystemPrompt() contains SEVERITY_DEFINITION", () => {
    const prompt = buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot());
    expect(prompt).toContain(SEVERITY_DEFINITION);
  });
});

// ============================================================================
// TC-016: judge prompt が verdict 行の出力を要求しない
// Source: design.md > D3 / tasks.md > T-05 Acceptance Criteria
// ============================================================================

describe("TC-016: judge prompt が verdict 行の出力を要求しない", () => {
  for (const [name, prompt] of JUDGE_PROMPTS) {
    for (const pattern of VERDICT_OUTPUT_INSTRUCTION_PATTERNS) {
      it(`TC-016: ${name} does not contain verdict output instruction "${pattern}"`, () => {
        expect(prompt).not.toContain(pattern);
      });
    }
  }
});

// ============================================================================
// TC-017: producer prompt が COMPLETION_DIRECTIVE を保持する
// Source: design.md > D3 / tasks.md > T-03 Acceptance Criteria
// ============================================================================

describe("TC-017: producer prompt が COMPLETION_DIRECTIVE を保持する", () => {
  for (const [name, prompt] of PRODUCER_8_PROMPTS) {
    it(`TC-017: ${name} contains COMPLETION_DIRECTIVE`, () => {
      expect(prompt).toContain(COMPLETION_DIRECTIVE);
    });
  }
});

// ============================================================================
// TC-028: drift-guard テストが配列反復で全 prompt を網羅する構造を持つ
// (Structural self-verification — verifying this test file's coverage)
// Source: tasks.md > T-09 Acceptance Criteria
// ============================================================================

describe("TC-028: drift-guard テストが配列反復で全 prompt を網羅する構造を持つ", () => {
  it("TC-028: ALL_15_AGENT_PROMPTS array contains exactly 15 entries", () => {
    expect(ALL_15_AGENT_PROMPTS.length).toBe(15);
  });

  it("TC-028: JUDGE_PROMPTS contains all 6 judge steps", () => {
    expect(JUDGE_PROMPTS.length).toBe(6);
  });

  it("TC-028: PRODUCER_AND_FIXER_PROMPTS covers all 8 producer/fixer steps", () => {
    expect(PRODUCER_AND_FIXER_PROMPTS.length).toBe(8);
  });
});
