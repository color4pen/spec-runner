/**
 * Static unit tests for rules content structural guarantees.
 *
 * These tests catch PR #339 / #343 / #344 type ADR placement accidents:
 *   - RULES_MD_CONTENT contains ADR discipline section
 *   - All 11 agent system prompts contain a Read instruction for rules.md
 *   - design / code-review / code-fixer prompts do NOT reference docs/adr/
 *     (prevents industry convention MADR from triggering wrong path)
 *
 * No LLM calls — pure static string assertions.
 */
import { describe, test, expect } from "vitest";
import { RULES_MD_CONTENT } from "../../src/prompts/rules.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../src/prompts/implementer-system.js";
import { DESIGN_SYSTEM_PROMPT } from "../../src/prompts/design-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../src/prompts/spec-fixer-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../src/prompts/code-fixer-system.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../src/prompts/build-fixer-system.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../../src/prompts/adr-gen-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/spec-review-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/code-review-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../src/prompts/test-case-gen-system.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../src/prompts/request-generate-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../src/prompts/request-review-system.js";

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

// ────────────────────────────────────────────
// rules content
// ────────────────────────────────────────────

describe("rules.md — ADR placement discipline section", () => {
  test("contains 'ADR 配置の特記' section", () => {
    expect(RULES_MD_CONTENT).toContain("ADR 配置の特記");
  });

  test("contains '業界慣習 MADR' keyword", () => {
    expect(RULES_MD_CONTENT).toContain("業界慣習 MADR");
  });

  test("contains '採用しません' keyword (MADR not adopted)", () => {
    expect(RULES_MD_CONTENT).toContain("採用しません");
  });

  test("contains 'adr-gen 以外' keyword", () => {
    expect(RULES_MD_CONTENT).toContain("adr-gen 以外");
  });

  test("contains canonical ADR path 'specrunner/adr/{YYYY-MM-DD}-{slug}.md'", () => {
    expect(RULES_MD_CONTENT).toContain("specrunner/adr/{YYYY-MM-DD}-{slug}.md");
  });
});

// ────────────────────────────────────────────
// All 11 agent prompts contain rules.md Read instruction
// ────────────────────────────────────────────

describe("all 11 agent prompts — rules.md Read instruction", () => {
  test.each(ALL_AGENT_PROMPTS)(
    "%s contains rules.md path in Read instruction",
    (_name, prompt) => {
      expect(prompt).toContain("specrunner/changes/<slug>/rules.md");
    },
  );
});

// ────────────────────────────────────────────
// design / code-review / code-fixer do NOT reference docs/adr/
// (prevents MADR industry convention from triggering wrong path)
// ────────────────────────────────────────────

describe("ADR path guard — design / code-review / code-fixer must not mention docs/adr/", () => {
  test("DESIGN prompt does not contain 'docs/adr/'", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("docs/adr/");
  });

  test("CODE_REVIEW prompt does not contain 'docs/adr/'", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain("docs/adr/");
  });

  test("CODE_FIXER prompt does not contain 'docs/adr/'", () => {
    expect(CODE_FIXER_SYSTEM_PROMPT).not.toContain("docs/adr/");
  });
});
