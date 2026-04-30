/**
 * TC-005: git execFile succeeds → pass
 * TC-006: git execFile fails → fail
 */
import { describe, it, expect, vi } from "vitest";
import { gitVersionCheck } from "../../../../../src/core/doctor/checks/runtime/git.js";
import { buildMockContext } from "../../mock-context.js";

describe("gitVersionCheck", () => {
  // TC-005
  it("returns pass when execFile('git', ['--version']) succeeds", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({ stdout: "git version 2.44.0\n", stderr: "" }),
    });
    const result = await gitVersionCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("git version");
  });

  // TC-006
  it("returns fail when execFile throws", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(new Error("command not found: git")),
    });
    const result = await gitVersionCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
