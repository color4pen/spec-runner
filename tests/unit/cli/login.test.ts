/**
 * Unit tests for src/cli/login.ts — runLogin()
 *
 * TC-LOGIN-001: runDeviceFlow() succeeds, no existing creds, no env vars → token saved, no warning, exit 0
 * TC-LOGIN-007: runDeviceFlow() throws → no saveCredentials, exit 1
 * TC-LOGIN-010: existing creds token, no force → device flow not called, logWarn, no save, exit 0
 * TC-LOGIN-011: existing creds token, force → device flow called, save overwrites, exit 0
 * TC-LOGIN-012: GH_TOKEN set, no existing creds → warn about GH_TOKEN priority, device flow runs, save, exit 0
 * TC-LOGIN-013: GITHUB_TOKEN set, no existing creds → warn about GITHUB_TOKEN priority, device flow runs, exit 0
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

// Mock runDeviceFlow — will be configured per test
vi.mock("../../../src/auth/github-device.js", () => ({
  runDeviceFlow: vi.fn(),
}));

// Mock config store
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, agents: {} }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

// Mock credentials
vi.mock("../../../src/core/credentials/github.js", () => ({
  loadCredentials: vi.fn().mockResolvedValue({}),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/core/credentials/claude-code.js", () => ({
  saveClaudeCodeOAuthToken: vi.fn().mockResolvedValue(undefined),
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

// Mock fs.access — login.ts uses it for config-file existence check
vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined), // default: config file exists
}));

import { runLogin } from "../../../src/cli/login.js";
import { runDeviceFlow } from "../../../src/auth/github-device.js";
import { logWarn } from "../../../src/logger/stdout.js";
import { saveCredentials, loadCredentials } from "../../../src/core/credentials/github.js";
import { saveClaudeCodeOAuthToken } from "../../../src/core/credentials/claude-code.js";
import { loadConfig, saveConfig } from "../../../src/config/store.js";

describe("runLogin()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing credentials
    vi.mocked(loadCredentials).mockResolvedValue({});
    // Default: config file exists (fs.access succeeds) — scaffold not created
    vi.mocked(fs.access).mockResolvedValue(undefined);
    // Default: loadConfig succeeds (used for GitHub host resolution)
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, agents: {} });
  });

  it("TC-LOGIN-001: runDeviceFlow() succeeds → token saved, no warning, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghu_test",
    });

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("TC-LOGIN-007: runDeviceFlow() throws → no saveCredentials, exit 1", async () => {
    vi.mocked(runDeviceFlow).mockRejectedValue(new Error("expired_token"));

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(1);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("TC-LOGIN-010: existing creds token, no force → device flow not called, logWarn, no save, exit 0", async () => {
    vi.mocked(loadCredentials).mockResolvedValue({ github: { token: "ghp_existing" } });
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_new" });

    const exitCode = await runLogin({ env: {}, force: false });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("Existing token retained"));
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("--force"));
  });

  it("TC-LOGIN-011: existing creds token, force → device flow called, save overwrites, exit 0", async () => {
    vi.mocked(loadCredentials).mockResolvedValue({ github: { token: "ghp_existing" } });
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_new" });

    const exitCode = await runLogin({ env: {}, force: true });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_new" } }),
    );
  });

  it("TC-LOGIN-012: GH_TOKEN set, no existing creds → warn about GH_TOKEN, device flow runs, save, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: { GH_TOKEN: "ghp_env_token" } });

    expect(exitCode).toBe(0);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("GH_TOKEN"));
    expect(runDeviceFlow).toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalled();
  });

  it("TC-LOGIN-013: GITHUB_TOKEN set, no existing creds → warn about GITHUB_TOKEN, device flow runs, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: { GITHUB_TOKEN: "ghp_actions_token" } });

    expect(exitCode).toBe(0);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("GITHUB_TOKEN"));
    expect(runDeviceFlow).toHaveBeenCalled();
  });

  it("preserves bare login GitHub provider behavior", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    await runLogin({ env: {} });

    expect(runDeviceFlow).toHaveBeenCalled();
    expect(saveClaudeCodeOAuthToken).not.toHaveBeenCalled();
  });

  it("stores Claude token with provider claude", async () => {
    const exitCode = await runLogin({
      provider: "claude",
      env: {},
      promptToken: async () => " claude-token ",
    });

    expect(exitCode).toBe(0);
    expect(runDeviceFlow).not.toHaveBeenCalled();
    expect(saveClaudeCodeOAuthToken).toHaveBeenCalledWith("claude-token");
  });

  it("retains existing Claude token without force", async () => {
    vi.mocked(loadCredentials).mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "existing-token" },
    });

    const exitCode = await runLogin({
      provider: "claude",
      env: {},
      force: false,
      promptToken: async () => "new-token",
    });

    expect(exitCode).toBe(0);
    expect(saveClaudeCodeOAuthToken).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("Existing Claude Code token retained"));
  });

  it("overwrites existing Claude token with force", async () => {
    vi.mocked(loadCredentials).mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "existing-token" },
    });

    const exitCode = await runLogin({
      provider: "claude",
      env: {},
      force: true,
      promptToken: async () => "new-token",
    });

    expect(exitCode).toBe(0);
    expect(saveClaudeCodeOAuthToken).toHaveBeenCalledWith("new-token");
  });

  it("warns when CLAUDE_CODE_OAUTH_TOKEN env is set without printing the value", async () => {
    const exitCode = await runLogin({
      provider: "claude",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "secret-env-token" },
      promptToken: async () => "new-token",
    });

    expect(exitCode).toBe(0);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("CLAUDE_CODE_OAUTH_TOKEN"));
    for (const call of vi.mocked(logWarn).mock.calls) {
      expect(call[0]).not.toContain("secret-env-token");
    }
  });

  it("rejects empty Claude token input", async () => {
    const exitCode = await runLogin({
      provider: "claude",
      env: {},
      promptToken: async () => "   ",
    });

    expect(exitCode).toBe(1);
    expect(saveClaudeCodeOAuthToken).not.toHaveBeenCalled();
  });

  it("TC-LOGIN-014: config が存在する場合は saveConfig が呼ばれない", async () => {
    // fs.access succeeds (config file exists) — saveConfig must not be called
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(runDeviceFlow).mockResolvedValue({ accessToken: "ghu_test" });

    const exitCode = await runLogin({ env: {} });

    expect(exitCode).toBe(0);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("TC-LOGIN-015: config が存在しない場合は saveConfig が呼ばれる", async () => {
    // fs.access throws ENOENT (config file absent) — saveConfig must be called to create scaffold
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
});
