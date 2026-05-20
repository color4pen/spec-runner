/**
 * Structural guarantee test for PR #339-type prevention.
 *
 * Verifies that SPEC_RUNNER_COMMON_CONTEXT is structurally injected into all
 * agent system prompts, ensuring ADR / spec / change paths are always known.
 */
import { describe, test, expect } from "vitest";
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

describe("PR #339 prevention: ADR / spec / change paths are injected into all agent prompts", () => {
  test.each(ALL_AGENT_PROMPTS)("%s contains ADR path pattern", (_name, prompt) => {
    expect(prompt).toContain("specrunner/adr/");
  });

  test.each(ALL_AGENT_PROMPTS)("%s contains authority spec path pattern", (_name, prompt) => {
    expect(prompt).toContain("specrunner/specs/");
  });

  test.each(ALL_AGENT_PROMPTS)("%s contains change folder path pattern", (_name, prompt) => {
    expect(prompt).toContain("specrunner/changes/");
  });
});
