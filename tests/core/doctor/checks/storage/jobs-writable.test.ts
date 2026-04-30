/**
 * TC-039: jobs dir exists + writable → pass
 * TC-040: jobs dir absent + parent writable → warn
 * TC-041: jobs dir absent + parent not writable → fail
 * TC-042: jobs dir exists + not writable → fail
 * TC-040b: jobs dir and parent absent + grandparent writable → warn (new-user case)
 */
import { describe, it, expect, vi } from "vitest";
import { jobsWritableCheck } from "../../../../../src/core/doctor/checks/storage/jobs-writable.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("jobsWritableCheck", () => {
  // TC-039
  it("returns pass when jobs dir exists and is writable", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const fs = buildMockFs({ access });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await jobsWritableCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-040
  it("returns warn when jobs dir absent but parent is writable", async () => {
    let callCount = 0;
    const access = vi.fn().mockImplementation(async (p: string) => {
      callCount++;
      if (callCount === 1) {
        // First call: jobs dir — ENOENT
        const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        throw err;
      }
      // Second call: parent dir — writable
      return undefined;
    });
    const fs = buildMockFs({ access });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await jobsWritableCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("specrunner ps");
  });

  // TC-041
  it("returns fail when jobs dir absent and parent not writable", async () => {
    let callCount = 0;
    const access = vi.fn().mockImplementation(async () => {
      callCount++;
      const code = callCount === 1 ? "ENOENT" : "EACCES";
      const err = Object.assign(new Error(code), { code });
      throw err;
    });
    const fs = buildMockFs({ access });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await jobsWritableCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toMatch(/[Pp]arent directory is not writable/);
  });

  // TC-040b: both jobs dir and its parent are ENOENT, but grandparent is writable → warn
  it("returns warn when jobs dir and parent are absent but grandparent is writable", async () => {
    let callCount = 0;
    const access = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        // First call: jobs dir ENOENT, second call: parent dir ENOENT
        const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        throw err;
      }
      // Third call: grandparent dir — writable
      return undefined;
    });
    const fs = buildMockFs({ access });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await jobsWritableCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("specrunner ps");
  });

  // TC-042
  it("returns fail when jobs dir exists but not writable (EACCES)", async () => {
    const access = vi.fn().mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const fs = buildMockFs({ access });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await jobsWritableCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toMatch(/[Cc]heck permissions/);
  });
});
