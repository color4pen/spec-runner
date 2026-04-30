/**
 * Unit tests for src/prompts/implementer-system.ts
 *
 * TC-012 (partial): implementer system prompt contains positive-framing workflow context in Japanese
 * Source: spec.md — Requirement: Implementer system prompt SHALL describe pipeline workflow context positively
 */
import { describe, it, expect } from "vitest";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../src/prompts/implementer-system.js";

// TC-012: implementer system prompt — workflow context in Japanese
describe("TC-012: IMPLEMENTER_SYSTEM_PROMPT — positive-framing workflow context", () => {
  it("contains 'stage 3 (implementer)' workflow position", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("stage 3");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("implementer");
  });

  it("contains 'verification' as next step", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("verification");
  });

  it("contains 'code-review' as the step after verification", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("code-review");
  });

  it("contains build/test/lint reference in next-step context", () => {
    const hasBuildTestLint =
      IMPLEMENTER_SYSTEM_PROMPT.includes("build/test/lint") ||
      (IMPLEMENTER_SYSTEM_PROMPT.includes("build") &&
        IMPLEMENTER_SYSTEM_PROMPT.includes("test") &&
        IMPLEMENTER_SYSTEM_PROMPT.includes("lint"));
    expect(hasBuildTestLint).toBe(true);
  });

  it("uses positive framing 'hand off to verification' style (次工程に渡す or equivalent)", () => {
    const hasPositiveFraming =
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程に渡してください") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("渡して");
    expect(hasPositiveFraming).toBe(true);
  });

  it("does not use only negative framing ('Do not run tests yourself' style only)", () => {
    // Must have positive framing — purely negative is insufficient per spec
    // "Do not run tests yourself" alone would not satisfy the requirement
    // Check that positive direction exists
    const hasPositive =
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("渡して") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("hand off");
    expect(hasPositive).toBe(true);
  });
});

describe("IMPLEMENTER_SYSTEM_PROMPT — basic requirements", () => {
  it("is a non-empty string", () => {
    expect(typeof IMPLEMENTER_SYSTEM_PROMPT).toBe("string");
    expect(IMPLEMENTER_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it("still contains role/task definitions", () => {
    // Core implementer identity must remain
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("implementer");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("tasks.md");
  });

  it("still contains commit + push instructions", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("commit");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("push");
  });
});
