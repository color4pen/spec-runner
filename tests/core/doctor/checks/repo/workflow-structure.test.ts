/**
 * TC-031: all 4 dirs exist → pass
 * TC-032: 1 dir missing → warn with missing dir name
 */
import { describe, it, expect, vi } from "vitest";
import { workflowStructureCheck } from "../../../../../src/core/doctor/checks/repo/workflow-structure.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("workflowStructureCheck", () => {
  // TC-031
  it("returns pass when all 4 dirs exist", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(true) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-032
  it("returns warn when 'canceled' dir is missing", async () => {
    const existsSync = vi.fn().mockImplementation((path: string) => {
      return !path.endsWith("canceled");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("canceled");
  });
});
