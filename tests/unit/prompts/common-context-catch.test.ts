/**
 * Structural guarantee test for PR #339-type prevention.
 *
 * Verifies that all agent system prompts contain a Read instruction pointing
 * to rules.md in the change folder, and that RULES_MD_CONTENT contains
 * the ADR placement discipline.
 *
 * Two-layer verification:
 *   1. Agent prompts → rules.md Read instruction (static string assert)
 *   2. RULES_MD_CONTENT → ADR discipline section content (string constant assert)
 */
import { describe, test, expect } from "vitest";
import { RULES_MD_CONTENT } from "../../../src/prompts/rules.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../../src/prompts/implementer-system.js";
import { DESIGN_SYSTEM_PROMPT } from "../../../src/prompts/design-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/spec-fixer-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/code-fixer-system.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/build-fixer-system.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../../../src/prompts/adr-gen-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/spec-review-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/code-review-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../../src/prompts/test-case-gen-system.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../../src/prompts/request-generate-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/request-review-system.js";

const ALL_AGENT_PROMPTS: Array<[string, string]> = [
  ["IMPLEMENTER", IMPLEMENTER_SYSTEM_PROMPT],
  ["DESIGN", DESIGN_SYSTEM_PROMPT],
  ["SPEC_FIXER", SPEC_FIXER_SYSTEM_PROMPT],
  ["CODE_FIXER", CODE_FIXER_SYSTEM_PROMPT],
  ["BUILD_FIXER", BUILD_FIXER_SYSTEM_PROMPT],
  ["ADR_GEN", ADR_GEN_SYSTEM_PROMPT],
  ["SPEC_REVIEW", SPEC_REVIEW_SYSTEM_PROMPT],
  ["CODE_REVIEW", CODE_REVIEW_SYSTEM_PROMPT],
  ["TEST_CASE_GEN", TEST_CASE_GEN_SYSTEM_PROMPT],
  ["REQUEST_GENERATE", REQUEST_GENERATE_SYSTEM_PROMPT],
  ["REQUEST_REVIEW", REQUEST_REVIEW_SYSTEM_PROMPT],
];

// TC-31: common-context-catch.test.ts structure verification
describe("TC-31: common-context-catch.test.ts — structure", () => {
  test("TC-31: tests all 11 agent prompts", () => {
    expect(ALL_AGENT_PROMPTS.length).toBe(11);
  });

  test("TC-31: all entries are [string, string] tuples", () => {
    for (const [name, prompt] of ALL_AGENT_PROMPTS) {
      expect(typeof name).toBe("string");
      expect(typeof prompt).toBe("string");
    }
  });
});

describe("PR #339 prevention: all agent prompts contain rules.md Read instruction", () => {
  test.each(ALL_AGENT_PROMPTS)("%s contains rules.md Read instruction", (_name, prompt) => {
    expect(prompt).toContain("specrunner/changes/<slug>/rules.md");
  });
});

describe("PR #339 prevention: RULES_MD_CONTENT contains ADR placement discipline", () => {
  test("RULES_MD_CONTENT contains ADR placement discipline keywords", () => {
    expect(RULES_MD_CONTENT).toContain("業界慣習 MADR");
    expect(RULES_MD_CONTENT).toContain("採用しません");
    expect(RULES_MD_CONTENT).toContain("adr-gen 以外");
  });

  test("RULES_MD_CONTENT contains canonical ADR path", () => {
    expect(RULES_MD_CONTENT).toContain("specrunner/adr/{YYYY-MM-DD}-{slug}.md");
  });
});
