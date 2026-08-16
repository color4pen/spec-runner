/**
 * Unit tests for src/cli/login.ts — runLogin() (GitHub-only, validity-based)
 *
 * TC-LOGIN-001: no token → device flow runs, token saved, exit 0
 * TC-LOGIN-007: device flow throws → no saveCredentials, exit 1
 * TC-LOGIN-010: valid credentials token, no force → device flow not called, exit 0
 * TC-LOGIN-011: --force → device flow called regardless of token state, exit 0
 * TC-LOGIN-012: valid GH_TOKEN → device flow not called, exit 0
 * TC-LOGIN-013: valid GITHUB_TOKEN → device flow not called, exit 0
 * TC-LOGIN-014: config exists → saveConfig not called after device flow
 * TC-LOGIN-015: config absent → saveConfig called to create scaffold
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

// Mock runDeviceFlow
vi.mock("../../../src/auth/github-device.js", () => ({
  runDeviceFlow: vi.fn(),
}));

// Mock config store
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, agents: {} }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

// Mock credentials — include resolveGitHubToken (new dependency in login.ts)
vi.mock("../../../src/core/credentials/github.js", () => ({
  loadCredentials: vi.fn().mockResolvedValue({}),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
  resolveGitHubToken: vi.fn(),
}));

// Mock logger
vi.mock("../../../src/logger/stdout.js", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logSuccess: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock xdg so getConfigPath returns a deterministic path
vi.mock("../../../src/util/xdg.js", () => ({
  getConfigPath: vi.fn().mockReturnValue("/mock/specrunner/config.json"),
  resolveGitHubHost: vi.fn(),
}));

// Mock github-host
vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

// Mock fs.access — login.ts uses it for config-file existence check
vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined), // default: config file exists
}));

import { runLogin } from "../../../src/cli/login.js";
import { runDeviceFlow } from "../../../src/auth/github-device.js";
import { logWarn, logInfo } from "../../../src/logger/stdout.js";
import { saveCredentials, loadCredentials, resolveGitHubToken } from "../../../src/core/credentials/github.js";
import { loadConfig, saveConfig } from "../../../src/config/store.js";

const mockResolveGitHubToken = vi.mocked(resolveGitHubToken);

describe("runLogin() — GitHub-only, validity-based", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCredentials).mockResolvedValue({});
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, agents: {} });
    // Default: no token found
    mockResolveGitHubToken.mockRejectedValue(new Error("GitHub token not found."));
  });

  it("TC-LOGIN-001: no token → device flow runs, token saved, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("TC-LOGIN-007: device flow throws → no saveCredentials, exit 1", async () => {
    vi.mocked(runDeviceFlow).mockRejectedValue(new Error("expired_token"));

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(1);
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("TC-LOGIN-010: valid credentials token, no force → device flow not called, exit 0", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_existing", source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const exitCode = await runLogin({
      env: {},
      force: false,
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
    // Should emit info about being already authenticated
    const infoMessages = vi.mocked(logInfo).mock.calls.map((c) => String(c[0])).join(" ");
    expect(infoMessages).toMatch(/authenticated|source/i);
  });

  it("TC-LOGIN-011: --force → device flow always runs, exit 0", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_existing", source: "credentials" });
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_new" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const exitCode = await runLogin({
      env: {},
      force: true,
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).toHaveBeenCalled();
    // verifyTokenScopes should NOT be called when force=true
    expect(mockVerify).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_new" } }),
    );
  });

  it("TC-LOGIN-012: valid GH_TOKEN → device flow not called, exit 0", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_env_token", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const exitCode = await runLogin({
      env: { GH_TOKEN: "ghp_env_token" },
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalled();
  });

  it("TC-LOGIN-013: valid GITHUB_TOKEN → device flow not called, exit 0", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_actions_token", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const exitCode = await runLogin({
      env: { GITHUB_TOKEN: "ghp_actions_token" },
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
  });

  it("TC-LOGIN-014: config exists → saveConfig not called after device flow", async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined); // config exists
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(0);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("TC-LOGIN-015: config absent → saveConfig called to create scaffold", async () => {
    vi.mocked(fs.access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(0);
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, agents: {} }),
    );
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("invalid env token → fails non-0, no device flow", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_expired", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    const exitCode = await runLogin({
      env: { GH_TOKEN: "ghp_expired" },
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).not.toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
  });

  it("invalid credentials token → device flow runs to update", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_old_invalid", source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_new" });

    const exitCode = await runLogin({
      env: {},
      verifyTokenScopes: mockVerify,
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).toHaveBeenCalled();
  });

  it("does not print token value in any log output", async () => {
    const secretToken = "ghp_super_secret_12345";
    mockResolveGitHubToken.mockResolvedValue({ token: secretToken, source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    await runLogin({
      env: {},
      verifyTokenScopes: mockVerify,
    });

    for (const call of vi.mocked(logInfo).mock.calls) {
      expect(String(call[0])).not.toContain(secretToken);
    }
    for (const call of vi.mocked(logWarn).mock.calls) {
      expect(String(call[0])).not.toContain(secretToken);
    }
  });
});
