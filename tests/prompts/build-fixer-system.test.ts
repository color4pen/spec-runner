/**
 * Unit tests for src/prompts/build-fixer-system.ts
 *
 * TC-024: build-fixer prompt に test-coverage 失敗時の対処規律が含まれる
 */
import { describe, it, expect } from "vitest";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../src/prompts/build-fixer-system.js";

// TC-024: BUILD_FIXER_SYSTEM_PROMPT — test-coverage 失敗時の対処規律
describe("TC-024: BUILD_FIXER_SYSTEM_PROMPT — test-coverage 失敗時の対処規律", () => {
  it("Phase: test-coverage が failed の場合に verification-result.md から missing TC ID を確認する指示が含まれる", () => {
    const hasMissingTcRef =
      BUILD_FIXER_SYSTEM_PROMPT.includes("test-coverage") &&
      (BUILD_FIXER_SYSTEM_PROMPT.includes("missing") ||
        BUILD_FIXER_SYSTEM_PROMPT.includes("TC ID") ||
        BUILD_FIXER_SYSTEM_PROMPT.includes("TC-"));
    expect(hasMissingTcRef).toBe(true);
  });

  it("test-cases.md から GIVEN/WHEN/THEN を読んで test を追加する指示が含まれる", () => {
    const hasTestCasesMdRef =
      BUILD_FIXER_SYSTEM_PROMPT.includes("test-cases.md") &&
      (BUILD_FIXER_SYSTEM_PROMPT.includes("GIVEN") ||
        BUILD_FIXER_SYSTEM_PROMPT.includes("WHEN") ||
        BUILD_FIXER_SYSTEM_PROMPT.includes("test を追加") ||
        BUILD_FIXER_SYSTEM_PROMPT.includes("test を `tests/`"));
    expect(hasTestCasesMdRef).toBe(true);
  });

  it("test 関数名または comment に TC ID を記載する規律が含まれる", () => {
    const hasTcIdRule =
      BUILD_FIXER_SYSTEM_PROMPT.includes("TC ID") ||
      BUILD_FIXER_SYSTEM_PROMPT.includes('it("TC-');
    expect(hasTcIdRule).toBe(true);
  });
});

describe("BUILD_FIXER_SYSTEM_PROMPT — basic requirements", () => {
  it("is a non-empty string", () => {
    expect(typeof BUILD_FIXER_SYSTEM_PROMPT).toBe("string");
    expect(BUILD_FIXER_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it("contains build-fixer role description", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("build-fixer");
  });

  it("contains verification-result.md reference", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("verification-result.md");
  });
});
