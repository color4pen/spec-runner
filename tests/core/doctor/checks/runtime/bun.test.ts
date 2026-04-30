/**
 * TC-003: bun execFile succeeds → pass
 * TC-004: bun execFile fails → fail
 */
import { describe, it, expect, vi } from "vitest";
import { bunVersionCheck } from "../../../../../src/core/doctor/checks/runtime/bun.js";
import { buildMockContext } from "../../mock-context.js";

describe("bunVersionCheck", () => {
  // TC-003
  it("returns pass when execFile('bun', ['--version']) succeeds", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({ stdout: "1.1.0\n", stderr: "" }),
    });
    const result = await bunVersionCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-004
  it("returns fail when execFile throws", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(new Error("command not found: bun")),
    });
    const result = await bunVersionCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/bun/i);
  });
});
