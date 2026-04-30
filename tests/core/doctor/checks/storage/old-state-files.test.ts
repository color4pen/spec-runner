/**
 * TC-059: <= 100 files → pass
 * TC-060: > 100 files → warn with gc hint
 */
import { describe, it, expect, vi } from "vitest";
import { oldStateFilesCheck } from "../../../../../src/core/doctor/checks/storage/old-state-files.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("oldStateFilesCheck", () => {
  // TC-059
  it("returns pass when 50 files exist", async () => {
    const files = Array.from({ length: 50 }, (_, i) => `job-${i}.json`);
    const fs = buildMockFs({ readdirSync: vi.fn().mockReturnValue(files) });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await oldStateFilesCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-060
  it("returns warn when 101 files exist", async () => {
    const files = Array.from({ length: 101 }, (_, i) => `job-${i}.json`);
    const fs = buildMockFs({ readdirSync: vi.fn().mockReturnValue(files) });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await oldStateFilesCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toMatch(/[Mm]anually remove/);
  });

  it("returns pass when jobs dir does not exist", async () => {
    const readdirSync = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const fs = buildMockFs({ readdirSync });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await oldStateFilesCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});
