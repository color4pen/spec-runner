/**
 * TC-028: IssueFidelityComparator port が core 層に閉じる（adapter を import しない）
 *   Source: tasks.md > T-02
 *
 * GIVEN src/core/port/issue-fidelity-comparator.ts の import 依存グラフ
 * WHEN layering テスト / DSM 制約を実行する
 * THEN core port は adapter（src/adapter/）を直接 import せず、既存 layering 制約に違反しない
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// TC-028: IssueFidelityComparator port が core 層に閉じる
// ---------------------------------------------------------------------------

describe("TC-028: IssueFidelityComparator port が core 層に閉じる（adapter を import しない）", () => {
  const portFilePath = path.resolve(
    __dirname,
    "../../../../src/core/port/issue-fidelity-comparator.ts",
  );

  it("TC-028-a: src/core/port/issue-fidelity-comparator.ts が存在する", () => {
    expect(fs.existsSync(portFilePath)).toBe(true);
  });

  it("TC-028-b: port ファイルが src/adapter/ を import していない", () => {
    const content = fs.readFileSync(portFilePath, "utf-8");

    // port は adapter を直接 import してはいけない
    expect(content).not.toMatch(/from ['"].*\/adapter\//);
    expect(content).not.toMatch(/import.*from ['"].*adapter/);
    expect(content).not.toMatch(/require\(.*adapter/);
  });

  it("TC-028-c: port ファイルが IssueFidelityComparator interface をエクスポートする", () => {
    const content = fs.readFileSync(portFilePath, "utf-8");
    expect(content).toContain("IssueFidelityComparator");
    expect(content).toContain("export");
  });

  it("TC-028-d: port ファイルが IssueFidelityComparison interface をエクスポートする", () => {
    const content = fs.readFileSync(portFilePath, "utf-8");
    expect(content).toContain("IssueFidelityComparison");
  });

  it("TC-028-e: port ファイルが undeclaredDrops フィールドを定義する", () => {
    const content = fs.readFileSync(portFilePath, "utf-8");
    expect(content).toContain("undeclaredDrops");
  });
});

// ---------------------------------------------------------------------------
// Additional: import check from TypeScript resolution
// ---------------------------------------------------------------------------

describe("TC-028: IssueFidelityComparator が TypeScript でインポートできる", () => {
  it("TC-028-f: IssueFidelityComparator と IssueFidelityComparison が型としてインポートできる", async () => {
    // Dynamic import to trigger module resolution (confirms file exists and exports are valid)
    const mod = await import("../../../../src/core/port/issue-fidelity-comparator.js");

    // The module itself may only export types (no runtime value), but it must be importable
    // If the file doesn't exist or has syntax errors, this import will fail
    expect(mod).toBeDefined();
  });
});
