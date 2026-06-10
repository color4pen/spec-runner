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

// Mock logger
vi.mock("../../../src/logger/stdout.js", () => ({
  logInfo: vi.fn(),
  logSuccess: vi.fn(),
  logWarn: vi.fn(),
}));

import { runLogin } from "../../../src/cli/login.js";
import { runDeviceFlow } from "../../../src/auth/github-device.js";
import { logWarn } from "../../../src/logger/stdout.js";
import { saveCredentials, loadCredentials } from "../../../src/core/credentials/github.js";

describe("runLogin()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing credentials
    vi.mocked(loadCredentials).mockResolvedValue({});
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
});
