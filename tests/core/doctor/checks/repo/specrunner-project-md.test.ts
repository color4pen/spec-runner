/**
 * TC-029: specrunner/project.md exists → pass
 * TC-030: specrunner/project.md not found → warn (required: false)
 */
import { describe, it, expect, vi } from "vitest";
import { specrunnerProjectMdCheck } from "../../../../../src/core/doctor/checks/repo/specrunner-project-md.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("specrunnerProjectMdCheck", () => {
  // TC-029
  it("returns pass when specrunner/project.md exists", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(true) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await specrunnerProjectMdCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-030
  it("returns warn when specrunner/project.md does not exist (required: false)", async () => {
    const fs = buildMockFs({ existsSync: vi.fn().mockReturnValue(false) });
    const ctx = buildMockContext({ fs, cwd: "/fake/repo" });
    const result = await specrunnerProjectMdCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(specrunnerProjectMdCheck.required).toBe(false);
  });
});
