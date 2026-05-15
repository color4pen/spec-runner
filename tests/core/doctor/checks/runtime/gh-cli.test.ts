/**
 * TC-GH-CLI-001: gh CLI is available → pass with version string
 * TC-GH-CLI-002: gh CLI not in PATH → fail with install hint
 */
import { describe, it, expect, vi } from "vitest";
import { ghCliPresentCheck } from "../../../../../src/core/doctor/checks/runtime/gh-cli.js";
import { buildMockContext } from "../../mock-context.js";

describe("ghCliPresentCheck", () => {
  // TC-GH-CLI-001
  it("returns pass when execFile('gh', ['--version']) succeeds", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({ stdout: "gh version 2.49.0 (2024-04-03)\nhttps://github.com/cli/cli/releases/tag/v2.49.0\n", stderr: "" }),
    });
    const result = await ghCliPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("gh version");
  });

  // TC-GH-CLI-002
  it("returns fail with install hint when execFile throws", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(new Error("command not found: gh")),
    });
    const result = await ghCliPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toContain("not installed");
    expect(result.hint).toContain("cli.github.com");
  });
});
