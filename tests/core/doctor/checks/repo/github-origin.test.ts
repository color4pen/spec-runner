/**
 * TC-027: origin → github.com → pass
 * TC-028: origin → gitlab.com → fail
 * TC-063: no origin remote → fail
 */
import { describe, it, expect, vi } from "vitest";
import { githubOriginCheck } from "../../../../../src/core/doctor/checks/repo/github-origin.js";
import { buildMockContext } from "../../mock-context.js";

describe("githubOriginCheck", () => {
  // TC-027
  it("returns pass when origin points to github.com", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({
        stdout: "https://github.com/owner/repo.git\n",
        stderr: "",
      }),
    });
    const result = await githubOriginCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-028
  it("returns fail when origin points to gitlab.com", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({
        stdout: "https://gitlab.com/owner/repo.git\n",
        stderr: "",
      }),
    });
    const result = await githubOriginCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  // TC-063
  it("returns fail when execFile throws (no origin remote)", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(new Error("fatal: No such remote 'origin'")),
    });
    const result = await githubOriginCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns pass for SSH github.com URL", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({
        stdout: "git@github.com:owner/repo.git\n",
        stderr: "",
      }),
    });
    const result = await githubOriginCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});
