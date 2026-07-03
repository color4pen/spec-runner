/**
 * Unit tests for src/core/doctor/checks/runtime/aozu-cli.ts
 *
 * TC-DOCTOR-001: design layer disabled → pass without calling execFile
 * TC-DOCTOR-002: design layer enabled + execFile rejects → fail with hint
 * TC-DOCTOR-003: design layer enabled + execFile resolves → pass
 * TC-DOCTOR-004: custom command name is used in execFile call
 */
import { describe, it, expect, vi } from "vitest";
import { aozuCliCheck } from "../../../../src/core/doctor/checks/runtime/aozu-cli.js";
import type { DoctorContext } from "../../../../src/core/doctor/types.js";

function makeCtx(configValues: Record<string, unknown> = {}, execFileImpl?: () => Promise<unknown>): DoctorContext {
  return {
    cwd: "/repo",
    env: {},
    now: new Date(),
    fetch: vi.fn(),
    fs: {} as never,
    execFile: execFileImpl ? vi.fn().mockImplementation(execFileImpl) : vi.fn().mockResolvedValue({ stdout: "aozu 1.0.0", stderr: "" }),
    config: {
      get: vi.fn().mockImplementation((path: string) => configValues[path]),
      loaded: true,
    },
    githubClient: { verifyTokenScopes: vi.fn() },
    homeDir: "/home/user",
    processVersion: "v20.0.0",
    platform: "linux" as NodeJS.Platform,
    resolvedGitHubToken: null,
    githubTokenSource: null,
    resolvedSpecRunnerApiKey: null,
    specRunnerApiKeySource: null,
    resolvedClaudeCodeOAuthToken: null,
    claudeCodeOAuthTokenSource: null,
  };
}

describe("TC-DOCTOR-001: design layer disabled → pass, no execFile call", () => {
  it("returns pass when designLayer.enabled is false", async () => {
    const ctx = makeCtx({ "designLayer.enabled": false });
    const result = await aozuCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(ctx.execFile).not.toHaveBeenCalled();
  });

  it("returns pass when designLayer.enabled is undefined", async () => {
    const ctx = makeCtx({});
    const result = await aozuCliCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(ctx.execFile).not.toHaveBeenCalled();
  });

  it("message indicates disabled", async () => {
    const ctx = makeCtx({});
    const result = await aozuCliCheck.check(ctx);
    expect(result.message).toContain("disabled");
  });
});

describe("TC-DOCTOR-002: enabled + execFile rejects → fail with hint", () => {
  it("returns fail when aozu is not found", async () => {
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "aozu" },
      () => Promise.reject(new Error("ENOENT")),
    );
    const result = await aozuCliCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toBeTruthy();
    expect(result.hint).toContain("aozu");
  });
});

describe("TC-DOCTOR-003: enabled + execFile resolves → pass", () => {
  it("returns pass when aozu is found", async () => {
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "aozu" },
      () => Promise.resolve({ stdout: "aozu 1.0.0", stderr: "" }),
    );
    const result = await aozuCliCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});

describe("TC-DOCTOR-004: custom command name is used", () => {
  it("uses designLayer.command for the execFile call", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "my-aozu 1.0.0", stderr: "" });
    const ctx = makeCtx(
      { "designLayer.enabled": true, "designLayer.command": "my-aozu" },
    );
    ctx.execFile = execFile;
    await aozuCliCheck.check(ctx);
    expect(execFile).toHaveBeenCalledWith("my-aozu", ["--version"], expect.objectContaining({ signal: expect.anything() }));
  });
});

describe("Check metadata", () => {
  it("has name aozu-cli", () => {
    expect(aozuCliCheck.name).toBe("aozu-cli");
  });
  it("has category runtime", () => {
    expect(aozuCliCheck.category).toBe("runtime");
  });
  it("is in commonChecks", async () => {
    const { commonChecks } = await import("../../../../src/core/doctor/checks/index.js");
    const found = commonChecks.find((c) => c.name === "aozu-cli");
    expect(found).toBeTruthy();
  });
});
