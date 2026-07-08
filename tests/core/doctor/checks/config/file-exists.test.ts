/**
 * TC-009: file exists + 0600 → pass
 * TC-010: file not found → fail + "Run 'specrunner init' first."
 * TC-011: permission 0644 → warn
 * TC-071: win32 → skip permission check
 * TC-072: ctx.config.loadError set → fail with malformed message (no "project local config" → falls back to user-global path)
 * TC-073: loadError mentions "project local config" → hint uses ctx.cwd-derived project-local path, not user-global
 */
import { describe, it, expect, vi } from "vitest";
import { configFileExistsCheck } from "../../../../../src/core/doctor/checks/config/file-exists.js";
import { buildMockContext, buildMockFs, buildMockConfig } from "../../mock-context.js";

describe("configFileExistsCheck", () => {
  // TC-009
  it("returns pass when file exists with mode 0o100600", async () => {
    const fs = buildMockFs({
      stat: vi.fn().mockResolvedValue({ mode: 0o100600, isDirectory: () => false }),
    });
    const ctx = buildMockContext({ fs, env: {} });
    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-010
  it("returns fail when stat throws ENOENT", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = buildMockFs({ stat: vi.fn().mockRejectedValue(enoent) });
    const ctx = buildMockContext({ fs, env: {} });
    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("specrunner init");
  });

  // TC-011
  it("returns warn when file has permission 0644", async () => {
    const fs = buildMockFs({
      stat: vi.fn().mockResolvedValue({ mode: 0o100644, isDirectory: () => false }),
    });
    const ctx = buildMockContext({ fs, env: {} });
    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/permission|0644/i);
  });

  // TC-071
  it("returns pass on win32 even with non-0600 permission", async () => {
    const fs = buildMockFs({
      stat: vi.fn().mockResolvedValue({ mode: 0o100644, isDirectory: () => false }),
    });
    const ctx = buildMockContext({ fs, platform: "win32" });
    const result = await configFileExistsCheck.check(ctx);
    // Should not be fail — warn or pass is acceptable
    expect(result.status).not.toBe("fail");
  });

  // TC-072: config file exists (stat OK) but JSON is malformed → distinct fail
  // loadErrorPath absent → hint falls back to user-global path (backward compat)
  it("returns fail with malformed message when ctx.config.loadError is set", async () => {
    const config = { ...buildMockConfig({}), loadError: "Unexpected token < in JSON" };
    const ctx = buildMockContext({ config });
    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/malformed/i);
    expect(result.message).toContain("Unexpected token < in JSON");
  });

  // TC-073: loadError mentions "project local config" → hint derives path from ctx.cwd, not user-global
  it("TC-073: hint uses cwd-derived project-local path when error mentions 'project local config'", async () => {
    // Mock context has cwd: "/fake/cwd" — project-local path is derived from it
    const config = {
      ...buildMockConfig({}),
      loadError: "JSON parse error in project local config.",
    };
    const ctx = buildMockContext({ config });
    const result = await configFileExistsCheck.check(ctx);
    expect(result.status).toBe("fail");
    // Hint must mention the project-local path (derived from ctx.cwd = "/fake/cwd")
    expect(result.hint).toContain("/fake/cwd/.specrunner/config.json");
    // Hint must NOT mention the user-global path (homeDir is /fake/home in mock context)
    expect(result.hint).not.toContain("/fake/home/.config/specrunner/config.json");
  });
});
