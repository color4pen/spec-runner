/**
 * TC-35: ADR に設計判断が記録されている
 *
 * Verifies that the ADR for prompt-common-context-injection contains
 * the required sections documenting design decisions.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CWD = process.cwd();
const ADR_PATH = path.join(
  CWD,
  "specrunner/adr/2026-05-20-prompt-common-context-injection.md",
);

// TC-35: ADR に設計判断が記録されている
describe("TC-35: ADR — prompt-common-context-injection に設計判断が記録されている", () => {
  it("TC-35: ADR ファイルが存在する", async () => {
    const stat = await fs.stat(ADR_PATH);
    expect(stat.isFile()).toBe(true);
  });

  it("TC-35: 「共通 prompt fragment の責務配置」が記録されている", async () => {
    const content = await fs.readFile(ADR_PATH, "utf-8");
    expect(content).toContain("共通 prompt fragment の責務配置");
  });

  it("TC-35: 「強制注入の方針」が記録されている", async () => {
    const content = await fs.readFile(ADR_PATH, "utf-8");
    expect(content).toContain("強制注入の方針");
  });

  it("TC-35: 「既存 fragment との関係 (統合方針)」が記録されている", async () => {
    const content = await fs.readFile(ADR_PATH, "utf-8");
    expect(content).toContain("統合方針");
  });

  it("TC-35: 「規律と役割の主語分離原則」が記録されている", async () => {
    const content = await fs.readFile(ADR_PATH, "utf-8");
    expect(content).toContain("規律と役割の主語分離原則");
  });

  it("TC-35: 「境界判定の分類例」が記録されている", async () => {
    const content = await fs.readFile(ADR_PATH, "utf-8");
    expect(content).toContain("境界判定の分類例");
  });
});
