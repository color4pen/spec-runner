/**
 * Unit tests for src/cli/login.ts — runLogin()
 *
 * TC-LOGIN-001: runDeviceFlow() succeeds → token saved, exit 0, no warning
 * TC-LOGIN-007: runDeviceFlow() throws → no saveCredentials, exit 1
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
import { saveCredentials } from "../../../src/core/credentials/github.js";

describe("runLogin()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-LOGIN-001: runDeviceFlow() succeeds → token saved, no warning, exit 0", async () => {
    vi.mocked(runDeviceFlow).mockResolvedValue({
      accessToken: "ghu_test",
    });

    const exitCode = await runLogin();

    expect(exitCode).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ github: { token: "ghu_test" } }),
    );
  });

  it("TC-LOGIN-007: runDeviceFlow() throws → no saveCredentials, exit 1", async () => {
    vi.mocked(runDeviceFlow).mockRejectedValue(new Error("expired_token"));

    const exitCode = await runLogin();

    expect(exitCode).toBe(1);
    expect(logWarn).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
  });
});
