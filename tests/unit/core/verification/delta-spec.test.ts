/**
 * Tests for delta spec content and ADR documentation.
 *
 * TC-025: verification-runner delta spec に test-coverage phase の Requirement が含まれる
 * TC-026: 各 capability の delta spec が作成されている
 * TC-030: ADR に TC 網羅性検証の責務配置と completionVerdict 判断が記録されている
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CHANGE_FOLDER = "specrunner/changes/verification-tc-coverage";
const CWD = process.cwd();

// TC-025: verification-runner delta spec に test-coverage phase の Requirement が含まれる
describe("TC-025: verification-runner delta spec — test-coverage phase Requirement", () => {
  it("delta spec ファイルが存在する", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/verification-runner/spec.md");
    const stat = await fs.stat(specPath);
    expect(stat.isFile()).toBe(true);
  });

  it("6 phase (build/typecheck/test/lint/security/test-coverage) の fail-fast 実行順序 Requirement が含まれる", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/verification-runner/spec.md");
    const content = await fs.readFile(specPath, "utf-8");
    expect(content).toContain("test-coverage");
    expect(content).toMatch(/build.*typecheck.*test.*lint.*security/s);
  });

  it("test-coverage phase が test-cases.md の must TC ID を tests/ から grep 検証する Requirement が含まれる", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/verification-runner/spec.md");
    const content = await fs.readFile(specPath, "utf-8");
    const hasMustTcRef =
      content.includes("must") &&
      (content.includes("grep") || content.includes("tests/"));
    expect(hasMustTcRef).toBe(true);
  });

  it("test-cases.md 不在時に skipped で記録される Requirement が含まれる", async () => {
    const specPath = path.join(CWD, CHANGE_FOLDER, "specs/verification-runner/spec.md");
    const content = await fs.readFile(specPath, "utf-8");
    expect(content).toContain("skipped");
  });
});

// TC-026: 各 capability の delta spec が作成されている
describe("TC-026: delta spec — 4 capability のファイルが存在する", () => {
  const specFiles = [
    `${CHANGE_FOLDER}/specs/verification-runner/spec.md`,
    `${CHANGE_FOLDER}/specs/test-case-generator/spec.md`,
    `${CHANGE_FOLDER}/specs/implementer-session/spec.md`,
    `${CHANGE_FOLDER}/specs/build-fixer-session/spec.md`,
  ];

  for (const relPath of specFiles) {
    it(`${relPath} が存在する`, async () => {
      const fullPath = path.join(CWD, relPath);
      const stat = await fs.stat(fullPath);
      expect(stat.isFile()).toBe(true);
    });
  }

  it("test-case-generator/spec.md に TC ID grep 可能性の Requirement が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, `${CHANGE_FOLDER}/specs/test-case-generator/spec.md`),
      "utf-8",
    );
    const hasGrepRef = content.includes("grep") || content.includes("downstream");
    expect(hasGrepRef).toBe(true);
  });

  it("implementer-session/spec.md に TC ID 記載規律の Requirement が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, `${CHANGE_FOLDER}/specs/implementer-session/spec.md`),
      "utf-8",
    );
    const hasTcIdRule = content.includes("TC ID") || content.includes("TC-");
    expect(hasTcIdRule).toBe(true);
  });

  it("build-fixer-session/spec.md に test-coverage 失敗対処の Requirement が含まれる", async () => {
    const content = await fs.readFile(
      path.join(CWD, `${CHANGE_FOLDER}/specs/build-fixer-session/spec.md`),
      "utf-8",
    );
    expect(content).toContain("test-coverage");
  });
});

// TC-030: ADR に TC 網羅性検証の責務配置と completionVerdict 判断が記録されている
describe("TC-030: ADR — TC 網羅性検証の責務配置と completionVerdict 判断が記録されている", () => {
  it("design.md に TC 網羅性検証の責務配置（verification phase 化）が記録されている", async () => {
    const designPath = path.join(CWD, CHANGE_FOLDER, "design.md");
    const content = await fs.readFile(designPath, "utf-8");
    expect(content).toContain("test-coverage");
    expect(content).toContain("verification");
  });

  it("design.md に implementer completionVerdict の判断（案 A vs 案 B）と採用理由（案 B）が記録されている", async () => {
    const designPath = path.join(CWD, CHANGE_FOLDER, "design.md");
    const content = await fs.readFile(designPath, "utf-8");
    expect(content).toContain("案 B");
    expect(content).toContain("completionVerdict");
  });

  it("design.md に test-coverage phase の実行方式（CLI 内部処理 vs script spawn）が記録されている", async () => {
    const designPath = path.join(CWD, CHANGE_FOLDER, "design.md");
    const content = await fs.readFile(designPath, "utf-8");
    const hasExecutionMode =
      content.includes("CLI 内部処理") ||
      content.includes("内部処理") ||
      content.includes("internal");
    expect(hasExecutionMode).toBe(true);
  });

  it("design.md に TC ID 形式の統一方針（フラット型 + 両形式許容 grep）が記録されている", async () => {
    const designPath = path.join(CWD, CHANGE_FOLDER, "design.md");
    const content = await fs.readFile(designPath, "utf-8");
    const hasTcIdPolicy =
      content.includes("フラット") ||
      content.includes("TC-NNN") ||
      content.includes("両形式");
    expect(hasTcIdPolicy).toBe(true);
  });
});
