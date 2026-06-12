/**
 * Unit tests for src/prompts/spec-fixer-system.ts
 * TC-028: buildSpecFixerSystemPrompt — required keywords present
 * TC-060: Author-Bias Elimination keyword (could)
 */
import { describe, it, expect } from "vitest";
import { buildSpecFixerSystemPrompt } from "../../src/prompts/spec-fixer-system.js";
import { specReviewResultPath } from "../../src/util/paths.js";

// TC-028: spec-fixer Agent — system_prompt が buildSpecFixerSystemPrompt 由来のキーワードを含む
describe("TC-028: buildSpecFixerSystemPrompt — contains required keywords", () => {
  it("contains spec-fixer, 修正, findings, and neutral completion instruction (StepExecutor handles commit+push)", () => {
    const prompt = buildSpecFixerSystemPrompt();

    expect(prompt).toContain("spec-fixer");
    expect(prompt).toContain("修正");
    expect(prompt).toContain("findings");
    // Provider-neutral completion: "作業を終える" or equivalent
    const hasFinishInstruction =
      prompt.includes("作業を終える") ||
      prompt.includes("完了結果を報告");
    expect(hasFinishInstruction).toBe(true);
  });

  it("contains review restriction or policy change restriction wording", () => {
    const prompt = buildSpecFixerSystemPrompt();
    // Must mention that reviewing or policy change is prohibited
    const hasReviewRestriction =
      prompt.includes("レビュー") ||
      prompt.includes("方針変更") ||
      prompt.includes("review") ||
      prompt.includes("役割");
    expect(hasReviewRestriction).toBe(true);
  });
});

// TC-060: buildSpecFixerSystemPrompt — Author-Bias Elimination キーワードが含まれる (could)
describe("TC-060: buildSpecFixerSystemPrompt — contains Author-Bias Elimination reference", () => {
  it("contains 'Author-Bias Elimination' or '前回の文脈を持ちません'", () => {
    const prompt = buildSpecFixerSystemPrompt();
    const hasAuthorBias =
      prompt.includes("Author-Bias Elimination") ||
      prompt.includes("前回の文脈を持ちません");
    expect(hasAuthorBias).toBe(true);
  });
});

// Additional: prompt is non-empty and static
describe("buildSpecFixerSystemPrompt — prompt stability", () => {
  it("returns the same string regardless of input", () => {
    const prompt1 = buildSpecFixerSystemPrompt();
    const prompt2 = buildSpecFixerSystemPrompt({
      slug: "test-slug",
      branch: "feat/test",
      findingsPath: specReviewResultPath("test", 1),
    });
    expect(prompt1).toBe(prompt2);
  });

  it("returns a non-empty string", () => {
    const prompt = buildSpecFixerSystemPrompt();
    expect(prompt.length).toBeGreaterThan(50);
  });
});
