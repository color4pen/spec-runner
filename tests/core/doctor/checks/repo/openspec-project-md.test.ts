/**
 * TC-029: openspec/project.md exists → pass
 * TC-030: openspec/project.md not found → warn (required: false)
 */
import { describe, it, expect, vi } from "vitest";
import { openspecProjectMdCheck } from "../../../../../src/core/doctor/checks/repo/openspec-project-md.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("openspecProjectMdCheck", () => {
  // TC-029
  it("returns pass when openspec/project.md exists", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(true) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await openspecProjectMdCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-030
  it("returns warn when openspec/project.md does not exist (required: false)", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(false) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await openspecProjectMdCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(openspecProjectMdCheck.required).toBe(false);
  });
});
