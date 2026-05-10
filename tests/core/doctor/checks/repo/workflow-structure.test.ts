/**
 * TC-031: all 3 dirs exist → pass
 * TC-032: 1 dir missing → warn with missing dir name
 * TC-033: specrunner/changes/ missing → warn
 */
import { describe, it, expect, vi } from "vitest";
import { workflowStructureCheck } from "../../../../../src/core/doctor/checks/repo/workflow-structure.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("workflowStructureCheck", () => {
  // TC-031
  it("returns pass when all dirs exist (active, merged, changes)", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(true) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-032
  it("returns warn when 'merged' dir is missing", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      return !p.endsWith("merged");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("merged");
  });

  // TC-033
  it("returns warn when specrunner/changes/ is missing", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      return !p.endsWith("changes");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("changes");
  });
});
