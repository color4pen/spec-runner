/**
 * TC-006: 必要ディレクトリ欠損時の hint が specrunner init を第一処方にする
 *
 * Source: spec.md > workflow-structure の欠損は `specrunner init` を第一処方にする
 *         > Scenario: 必要ディレクトリ欠損
 */
import { describe, it, expect } from "vitest";
import { workflowStructureCheck } from "../../../src/core/doctor/checks/repo/workflow-structure.js";
import { buildMockContext, buildMockFs } from "../../core/doctor/mock-context.js";

describe("TC-006: workflow-structure missing dirs hint", () => {
  it("drafts/ 欠損時の hint に 'specrunner init' が含まれる", async () => {
    // specrunner/drafts/ は存在しない, specrunner/changes/ は存在する
    const existsSync = (p: string) => {
      if (p.includes("drafts")) return false;
      return true;
    };
    const mockFs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("specrunner init");
  });

  it("changes/ 欠損時の hint に 'specrunner init' が含まれる", async () => {
    const existsSync = (p: string) => {
      if (p.includes("changes")) return false;
      return true;
    };
    const mockFs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("specrunner init");
  });

  it("drafts/ と changes/ 両方欠損時の hint に 'specrunner init' が含まれる", async () => {
    const existsSync = (_p: string) => false;
    const mockFs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("specrunner init");
  });

  it("欠損時の hint が 'Create the missing directories manually.' を第一処方にしない", async () => {
    const existsSync = (_p: string) => false;
    const mockFs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await workflowStructureCheck.check(ctx);
    const hint = result.hint ?? "";
    // hint must not start with the manual instruction
    expect(hint).not.toMatch(/^Create the missing directories manually\./);
    // If both appear, specrunner init must come before the manual instruction
    const initIdx = hint.indexOf("specrunner init");
    const manualIdx = hint.indexOf("Create the missing directories manually.");
    if (manualIdx !== -1 && initIdx !== -1) {
      expect(initIdx).toBeLessThan(manualIdx);
    }
  });

  it("全構造が存在するとき pass を返す（回帰防止）", async () => {
    const existsSync = (p: string) => {
      // active/ doesn't exist (avoid deprecation warn), all required dirs exist
      return !p.includes("requests");
    };
    const mockFs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs: mockFs });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});
