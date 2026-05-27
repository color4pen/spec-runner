/**
 * Unit tests for src/cli/login.ts — runLogin() scope verification
 *
 * TC-LOGIN-SCOPE-001: scopes = ["repo"] → no warning, exit 0
 * TC-LOGIN-SCOPE-002: scopes = ["repo", "read:org"] → no warning, exit 0
 * TC-LOGIN-SCOPE-003: scopes = ["read:org"] (no repo) → warning, exit 0
 * TC-LOGIN-SCOPE-004: scopes = [] (empty) → warning, exit 0
 * TC-LOGIN-SCOPE-007: runDeviceFlow() throws → no scope check, no saveCredentials, exit 1
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

// Mock logger — capture logWarn calls
vi.mock("../../../src/logger/stdout.js", () => ({
  logInfo: vi.fn(),
  logSuccess: vi.fn(),
  logWarn: vi.fn(),
}));

import { runLogin } from "../../../src/cli/login.js";
import { runDeviceFlow } from "../../../src/auth/github-device.js";
import { logWarn } from "../../../src/logger/stdout.js";
import { saveCredentials } from "../../../src/core/credentials/github.js";

describe("runLogin() scope verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-LOGIN-SCOPE-001: scopes=['repo'] → no warning, exit 0, token saved", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghp_test",
      scopes: ["repo"],
    });

    const exitCode = await runLogin();

    expect(exitCode).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghp_test" } }),
    );
  });

  it("TC-LOGIN-SCOPE-002: scopes=['repo','read:org'] → no warning, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghp_test",
      scopes: ["repo", "read:org"],
    });

    const exitCode = await runLogin();

    expect(exitCode).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("TC-LOGIN-SCOPE-003: scopes=['read:org'] (no repo) → warning shown, exit 0, token saved", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghp_test",
      scopes: ["read:org"],
    });

    const exitCode = await runLogin();

    expect(exitCode).toBe(0);
    expect(logWarn).toHaveBeenCalledOnce();
    expect(vi.mocked(logWarn).mock.calls[0]?.[0]).toContain("repo");
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghp_test" } }),
    );
  });

  it("TC-LOGIN-SCOPE-004: scopes=[] (empty) → warning shown, exit 0, token saved", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghp_test",
      scopes: [],
    });

    const exitCode = await runLogin();

    expect(exitCode).toBe(0);
    expect(logWarn).toHaveBeenCalledOnce();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghp_test" } }),
    );
  });

  it("TC-LOGIN-SCOPE-007: runDeviceFlow() throws → no scope check, no saveCredentials, exit 1", async () => {
    vi.mocked(runDeviceFlow).mockRejectedValue(new Error("expired_token"));

    const exitCode = await runLogin();

    expect(exitCode).toBe(1);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
  });
});
