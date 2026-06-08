/**
 * TC-PM-100: pnpm detected, execFile succeeds → pass with pnpm version
 * TC-PM-101: bun detected, execFile succeeds → pass with bun version
 * TC-PM-102: npm fallback (no lockfile), execFile succeeds → pass with npm version
 * TC-PM-103: detected PM execFile fails → fail with hint
 */
import { describe, it, expect, vi } from "vitest";
import { packageManagerCheck } from "../../../../../src/core/doctor/checks/runtime/package-manager.js";
import { buildMockContext, buildMockFs } from "../../mock-context.js";

// TC-PM-100
describe("TC-PM-100: pnpm detected → pass", () => {
  it("returns pass with pnpm version when pnpm-lock.yaml exists and execFile succeeds", async () => {
    const ctx = buildMockContext({
      cwd: "/fake/pnpm-project",
      fs: buildMockFs({
        existsSync: (p: string) => p.includes("pnpm-lock.yaml"),
      }),
      execFile: vi.fn().mockResolvedValue({ stdout: "9.12.0\n", stderr: "" }),
    });
    const result = await packageManagerCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/^pnpm /);
    expect(result.message).toContain("9.12.0");
  });
});

// TC-PM-101
describe("TC-PM-101: bun detected → pass", () => {
  it("returns pass with bun version when bun.lockb exists and execFile succeeds", async () => {
    const ctx = buildMockContext({
      cwd: "/fake/bun-project",
      fs: buildMockFs({
        existsSync: (p: string) => p.includes("bun.lockb"),
      }),
      execFile: vi.fn().mockResolvedValue({ stdout: "1.1.0\n", stderr: "" }),
    });
    const result = await packageManagerCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/^bun /);
    expect(result.message).toContain("1.1.0");
  });
});

// TC-PM-102
describe("TC-PM-102: npm fallback → pass", () => {
  it("returns pass with npm version when no lockfile exists and execFile succeeds", async () => {
    const ctx = buildMockContext({
      cwd: "/fake/no-lockfile",
      fs: buildMockFs({
        existsSync: () => false,
        readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      }),
      execFile: vi.fn().mockResolvedValue({ stdout: "10.2.0\n", stderr: "" }),
    });
    const result = await packageManagerCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/^npm /);
    expect(result.message).toContain("10.2.0");
  });
});

// TC-PM-103
describe("TC-PM-103: detected PM not installed → fail", () => {
  it("returns fail with hint when execFile throws for detected PM", async () => {
    const ctx = buildMockContext({
      cwd: "/fake/pnpm-project",
      fs: buildMockFs({
        existsSync: (p: string) => p.includes("pnpm-lock.yaml"),
      }),
      execFile: vi.fn().mockRejectedValue(new Error("command not found: pnpm")),
    });
    const result = await packageManagerCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/pnpm is not installed/);
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/pnpm/i);
  });

  it("returns fail with bun hint when bun binary is missing", async () => {
    const ctx = buildMockContext({
      cwd: "/fake/bun-project",
      fs: buildMockFs({
        existsSync: (p: string) => p.includes("bun.lockb"),
      }),
      execFile: vi.fn().mockRejectedValue(new Error("command not found: bun")),
    });
    const result = await packageManagerCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/bun is not installed/);
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/bun/i);
  });
});
