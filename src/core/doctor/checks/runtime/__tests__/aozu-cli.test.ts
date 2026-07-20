/**
 * Unit tests for aozuCliCheck doctor check.
 *
 * TC-DR-01: designLayer disabled (default) → pass without calling execFile
 * TC-DR-02: designLayer enabled, aozu absent → fail
 * TC-DR-03: designLayer enabled, aozu present → pass
 * TC-DR-04: custom designLayer.command → message references custom binary name
 */
import { describe, it, expect, vi } from "vitest";
import { aozuCliCheck } from "../aozu-cli.js";
import type { DoctorContext } from "../../../types.js";

function makeCtx(
  configValues: Record<string, unknown> = {},
  execFileImpl: DoctorContext["execFile"] = vi.fn(),
): DoctorContext {
  return {
    cwd: "/repo",
    env: {},
    now: new Date(),
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    fs: {
      stat: vi.fn(),
      existsSync: vi.fn(),
      readdirSync: vi.fn(),
      access: vi.fn(),
      constants: {} as unknown as typeof import("node:fs").constants,
      readFile: vi.fn(),
    },
    execFile: execFileImpl,
    config: {
      get: vi.fn((key: string) => configValues[key]),
      loaded: true,
    },
    githubClient: { verifyTokenScopes: vi.fn() },
    homeDir: "/home/user",
    processVersion: "v20.0.0",
    platform: "linux",
    resolvedGitHubToken: "ghp_test",
    githubTokenSource: "env",
    resolvedSpecRunnerApiKey: null,
    specRunnerApiKeySource: null,
    resolvedClaudeCodeOAuthToken: null,
    claudeCodeOAuthTokenSource: null,
    configPath: "/home/user/.config/specrunner/config.json",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-01: designLayer disabled (default)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-01: designLayer disabled (default) — pass without calling execFile", () => {
  it("returns pass when designLayer.enabled is undefined", async () => {
    const execFile = vi.fn();
    const ctx = makeCtx({}, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/disabled/i);
  });

  it("does not call execFile when designLayer.enabled is undefined", async () => {
    const execFile = vi.fn();
    const ctx = makeCtx({}, execFile);

    await aozuCliCheck.check(ctx);

    expect(execFile).not.toHaveBeenCalled();
  });

  it("returns pass when designLayer.enabled is false", async () => {
    const execFile = vi.fn();
    const ctx = makeCtx({ "designLayer.enabled": false }, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("pass");
    expect(execFile).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-02: designLayer enabled, aozu absent → fail
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-02: designLayer enabled, aozu absent — fail", () => {
  it("returns fail when execFile throws", async () => {
    const execFile = vi.fn().mockRejectedValue(new Error("command not found: aozu"));
    const ctx = makeCtx({ "designLayer.enabled": true }, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("fail");
  });

  it("fail message mentions aozu not installed or not in PATH", async () => {
    const execFile = vi.fn().mockRejectedValue(new Error("not found"));
    const ctx = makeCtx({ "designLayer.enabled": true }, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.message).toMatch(/not installed|not in PATH/i);
  });

  it("calls execFile with aozu and --version", async () => {
    const execFile = vi.fn().mockRejectedValue(new Error("not found"));
    const ctx = makeCtx({ "designLayer.enabled": true }, execFile);

    await aozuCliCheck.check(ctx);

    expect(execFile).toHaveBeenCalledWith("aozu", ["--version"], expect.anything());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-03: designLayer enabled, aozu present → pass
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-03: designLayer enabled, aozu present — pass", () => {
  it("returns pass when execFile resolves", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "aozu 1.0.0", stderr: "" });
    const ctx = makeCtx({ "designLayer.enabled": true }, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("pass");
  });

  it("pass message confirms aozu is available", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "aozu 1.0.0", stderr: "" });
    const ctx = makeCtx({ "designLayer.enabled": true }, execFile);

    const result = await aozuCliCheck.check(ctx);

    expect(result.message).toMatch(/aozu/i);
    expect(result.message).toMatch(/available/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-04: custom designLayer.command
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-04: custom designLayer.command — message references custom binary name", () => {
  it("uses the custom command when execFile resolves", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "my-aozu 2.0.0", stderr: "" });
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "my-aozu" },
      execFile,
    );

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.message).toContain("my-aozu");
  });

  it("calls execFile with the custom command", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "my-aozu 2.0.0", stderr: "" });
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "my-aozu" },
      execFile,
    );

    await aozuCliCheck.check(ctx);

    expect(execFile).toHaveBeenCalledWith("my-aozu", ["--version"], expect.anything());
  });

  it("fail message references custom command name when execFile throws", async () => {
    const execFile = vi.fn().mockRejectedValue(new Error("not found"));
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "my-aozu" },
      execFile,
    );

    const result = await aozuCliCheck.check(ctx);

    expect(result.status).toBe("fail");
    expect(result.message).toContain("my-aozu");
  });
});
