/**
 * TC-031: all 3 dirs exist → pass
 * TC-032: 1 dir missing → warn with missing dir name
 * TC-033: specrunner/changes/ missing → warn
 * TC-034: requests/active/ exists AND drafts/ missing → warn contains both "deprecated" and "drafts"
 */
import { describe, it, expect, vi } from "vitest";
import { workflowStructureCheck } from "../../../../../src/core/doctor/checks/repo/workflow-structure.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("workflowStructureCheck", () => {
  // TC-031
  it("returns pass when all dirs exist (drafts and changes)", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      // requests/active/ does NOT exist (deprecated), drafts/ and changes/ exist
      return !p.includes("requests/active") && !p.includes("requests\\active");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-032
  it("returns warn when 'drafts' dir is missing", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      // requests/active/ does not exist; drafts/ is missing; changes/ exists
      return !p.includes("requests/active") && !p.includes("requests\\active") && !p.endsWith("drafts");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("drafts");
  });

  // TC-033
  it("returns warn when specrunner/changes/ is missing", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      // requests/active/ does not exist; changes/ is missing; drafts/ exists
      return !p.includes("requests/active") && !p.includes("requests\\active") && !p.endsWith("changes");
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("changes");
  });

  // TC-034: combined case — deprecation warning must not mask missing-drafts warning
  it("returns warn containing both deprecation and missing-drafts when requests/active/ exists and drafts/ is missing", async () => {
    const existsSync = vi.fn().mockImplementation((p: string) => {
      // requests/active/ EXISTS (deprecated), drafts/ is MISSING, changes/ exists
      if (p.includes("requests/active") || p.includes("requests\\active")) return true;
      if (p.endsWith("drafts")) return false;
      return true;
    });
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await workflowStructureCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("deprecated");
    expect(result.message).toContain("drafts");
  });
});
