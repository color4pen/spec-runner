/**
 * TC-025: git rev-parse exits 0 → pass
 * TC-026: git rev-parse exits non-zero → fail (also detects nested subdirs correctly)
 */
import { describe, it, expect, vi } from "vitest";
import { gitRepositoryCheck } from "../../../../../src/core/doctor/checks/repo/git-repository.js";
import { buildMockContext, buildMockExecFile } from "../../mock-context.js";

describe("gitRepositoryCheck", () => {
  // TC-025
  it("returns pass when git rev-parse --is-inside-work-tree exits 0", async () => {
    const execFile = buildMockExecFile({ stdout: "true\n", stderr: "" });
    const ctx = buildMockContext({ execFile, cwd: "/fake/repo" });
    const result = await gitRepositoryCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-026
  it("returns fail when git rev-parse --is-inside-work-tree throws", async () => {
    const execFile = vi.fn().mockRejectedValue(
      Object.assign(new Error("fatal: not a git repository"), { code: 128 }),
    );
    const ctx = buildMockContext({ execFile, cwd: "/fake/notarepo" });
    const result = await gitRepositoryCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
