/**
 * TC-059: .specrunner/jobs/ absent → pass
 * TC-060: .specrunner/jobs/ present → warn with rm -rf hint
 */
import { describe, it, expect, vi } from "vitest";
import { legacyJobsDirCheck } from "../../../../../src/core/doctor/checks/storage/legacy-jobs-dir.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

describe("legacyJobsDirCheck", () => {
  // TC-059
  it("returns pass when .specrunner/jobs/ does not exist", async () => {
    const existsSync = vi.fn().mockReturnValue(false);
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await legacyJobsDirCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-060
  it("returns warn when .specrunner/jobs/ exists", async () => {
    const existsSync = vi.fn().mockReturnValue(true);
    const fs = buildMockFs({ existsSync });
    const ctx = buildMockContext({ fs, homeDir: "/home/user" });
    const result = await legacyJobsDirCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toMatch(/rm -rf/);
  });
});
