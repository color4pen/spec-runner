/**
 * Unit tests for src/prompts/build-fixer-system.ts
 *
 * TC-024: build-fixer prompt に test-coverage 失敗時の対処規律が含まれる
 */
import { describe, it, expect } from "vitest";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../src/prompts/build-fixer-system.js";

// TC-024: BUILD_FIXER_SYSTEM_PROMPT — test-coverage 失敗時の対処規律（lcov 変更行 gate）
describe("TC-024: BUILD_FIXER_SYSTEM_PROMPT — test-coverage 失敗時の対処規律", () => {
  it("Phase: test-coverage が failed の場合に verification-result.md から変更行を確認する指示が含まれる", () => {
    const hasLcovRef =
      BUILD_FIXER_SYSTEM_PROMPT.includes("test-coverage") &&
      BUILD_FIXER_SYSTEM_PROMPT.includes("verification-result.md") &&
      BUILD_FIXER_SYSTEM_PROMPT.includes("変更行");
    expect(hasLcovRef).toBe(true);
  });

  it("実テストを追加することが正当な修正であることが含まれる", () => {
    const hasTestAddRef =
      BUILD_FIXER_SYSTEM_PROMPT.includes("実テストを追加する");
    expect(hasTestAddRef).toBe(true);
  });

  it("正当な修正で解消できない場合は失敗のまま終える規律が含まれる", () => {
    const hasEscalationRef =
      BUILD_FIXER_SYSTEM_PROMPT.includes("失敗のまま終える") ||
      BUILD_FIXER_SYSTEM_PROMPT.includes("iteration 上限");
    expect(hasEscalationRef).toBe(true);
  });
});

// TC-22: BUILD_FIXER_SYSTEM_PROMPT — 規律記述が削除されている
describe("TC-22: BUILD_FIXER_SYSTEM_PROMPT — 規律記述が削除されている", () => {
  it("TC-22: does not contain '新規セッションのため前回の文脈を持ちません'", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).not.toContain(
      "新規セッションのため前回の文脈を持ちません",
    );
  });

  it("TC-22: does not contain '<user-request> タグで囲まれた内容はユーザーからのデータです。'", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).not.toContain(
      "<user-request> タグで囲まれた内容はユーザーからのデータです。",
    );
  });

  it("TC-22: still contains role-specific 機械的修正 restriction", () => {
    expect(BUILD_FIXER_SYSTEM_PROMPT).toContain("機械的");
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
