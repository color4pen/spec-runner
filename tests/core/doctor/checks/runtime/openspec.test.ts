/**
 * TC-007: npx openspec --version succeeds → pass
 * TC-008: timeout → warn
 */
import { describe, it, expect, vi } from "vitest";
import { openspecCheck } from "../../../../../src/core/doctor/checks/runtime/openspec.js";
import { buildMockContext } from "../../mock-context.js";

describe("openspecCheck", () => {
  // TC-007
  it("returns pass when npx openspec --version resolves", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockResolvedValue({ stdout: "0.5.0\n", stderr: "" }),
    });
    const result = await openspecCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-008
  it("returns warn when execFile throws an AbortError (timeout)", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(abortError),
    });
    const result = await openspecCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/timed out|timeout/i);
  });

  it("returns fail when npx openspec fails with non-abort error", async () => {
    const ctx = buildMockContext({
      execFile: vi.fn().mockRejectedValue(new Error("command not found: npx")),
    });
    const result = await openspecCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
