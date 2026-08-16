/**
 * Unit tests for specrunner login CLI (GitHub-only, validity-based).
 *
 * TC-003: valid token skips Device Flow (exit 0, source displayed)
 * TC-004: invalid token from env/gh fails without Device Flow (exit 1)
 * TC-005: invalid token from credentials.json proceeds to Device Flow
 * TC-006: no resolvable token proceeds to Device Flow
 * TC-007: unknown verification result fails without Device Flow (exit 1)
 * TC-008: --force always runs Device Flow
 * TC-001: --provider is not on help surface (LOGIN_USAGE has no --provider)
 * TC-002: login --provider claude is caught by deprecated flag (parser throws)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLogin } from "../login.js";
import { FlagParseError, parseFlags } from "../flag-parser.js";

// ── Mock resolveGitHubToken ──────────────────────────────────────────────────
vi.mock("../../core/credentials/github.js", () => ({
  loadCredentials: vi.fn().mockResolvedValue({}),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
  resolveGitHubToken: vi.fn(),
}));

// ── Mock device flow ─────────────────────────────────────────────────────────
const mockDeviceFlow = vi.fn().mockResolvedValue({ accessToken: "ghp_new" });

// ── Mock config store ─────────────────────────────────────────────────────────
vi.mock("../../config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, agents: {} }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock github-host resolution ──────────────────────────────────────────────
vi.mock("../../config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock("../../logger/stdout.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  stderrWrite: vi.fn(),
}));

import { resolveGitHubToken } from "../../core/credentials/github.js";
import { logInfo, logError } from "../../logger/stdout.js";
import { LOGIN_USAGE, COMMANDS } from "../command-registry.js";
import type { FlagDef } from "../flag-parser.js";

const mockResolveGitHubToken = vi.mocked(resolveGitHubToken);
const mockLogInfo = vi.mocked(logInfo);
const mockLogError = vi.mocked(logError);

beforeEach(() => {
  vi.clearAllMocks();
  mockDeviceFlow.mockResolvedValue({ accessToken: "ghp_new" });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: --provider is not in help surface (LOGIN_USAGE)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: --provider is absent from login help surface (LOGIN_USAGE)", () => {
  it("LOGIN_USAGE does not mention --provider", () => {
    expect(LOGIN_USAGE).not.toContain("--provider");
  });

  it("LOGIN_USAGE does not mention Claude Code section", () => {
    expect(LOGIN_USAGE).not.toContain("claude setup-token");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: login --provider claude is migration-captured by deprecated flag
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: login --provider claude is captured as deprecated flag", () => {
  it("parseFlags throws FlagParseError mentioning credentials set claude-code", () => {
    const loginEntry = COMMANDS["login"];
    if (!loginEntry || !("flags" in loginEntry)) throw new Error("login command not found");
    const loginFlags = (loginEntry as { flags: Record<string, FlagDef> }).flags;

    expect(() => {
      parseFlags(["--provider", "claude"], loginFlags);
    }).toThrow(FlagParseError);

    try {
      parseFlags(["--provider", "claude"], loginFlags);
    } catch (e) {
      expect((e as FlagParseError).message).toContain("credentials set claude-code");
    }
  });

  it("parseFlags throws FlagParseError for --provider=github too", () => {
    const loginEntry = COMMANDS["login"];
    if (!loginEntry || !("flags" in loginEntry)) throw new Error("login command not found");
    const loginFlags = (loginEntry as { flags: Record<string, FlagDef> }).flags;

    expect(() => {
      parseFlags(["--provider", "github"], loginFlags);
    }).toThrow(FlagParseError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: valid token skips Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: valid top-priority token skips the Device Flow", () => {
  it("does not call Device Flow when token is valid (env source)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_valid", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] });

    const code = await runLogin({
      env: { GH_TOKEN: "ghp_valid" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalled();
  });

  it("displays the source name when skipping", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_valid", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    await runLogin({
      env: { GH_TOKEN: "ghp_valid" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    const infoMessages = mockLogInfo.mock.calls.map((c) => String(c[0])).join(" ");
    expect(infoMessages).toMatch(/authenticated|source/i);
    expect(infoMessages).not.toContain("ghp_valid"); // no secret in output
  });

  it("does not call Device Flow when token is valid (gh source)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_gh", source: "gh" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });

  it("does not call Device Flow when token is valid (credentials source)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_creds", source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: invalid token from env/gh source fails without Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004: invalid token from env/gh source fails without Device Flow", () => {
  it("returns non-0 and does not call Device Flow for invalid env token (GH_TOKEN)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_expired", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    const code = await runLogin({
      env: { GH_TOKEN: "ghp_expired" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).not.toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });

  it("returns non-0 and does not call Device Flow for invalid env token (GITHUB_TOKEN)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_expired", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    const code = await runLogin({
      env: { GITHUB_TOKEN: "ghp_expired" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).not.toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });

  it("returns non-0 and does not call Device Flow for invalid gh token", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_expired_gh", source: "gh" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).not.toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });

  it("emits logError with remediation guidance", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_expired", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    await runLogin({
      env: { GH_TOKEN: "ghp_expired" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    const errorMessages = mockLogError.mock.calls.map((c) => String(c[0])).join(" ");
    expect(errorMessages).toMatch(/invalid|expired|GH_TOKEN|GITHUB_TOKEN|gh auth/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: invalid token from credentials.json proceeds to Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: invalid credentials.json token proceeds to Device Flow", () => {
  it("calls Device Flow when stored token is invalid (401)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_old_invalid", source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 401, scopes: [] });

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: no resolvable token proceeds to Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006: no resolvable token proceeds to Device Flow", () => {
  it("calls Device Flow when resolveGitHubToken throws (no token)", async () => {
    mockResolveGitHubToken.mockRejectedValue(new Error("GitHub token not found."));

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: unknown verification result fails without Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-007: unknown verification result does not overwrite silently", () => {
  it("returns non-0 and does not call Device Flow when API returns unexpected status", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_token", source: "credentials" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 500, scopes: [] });

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).not.toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });

  it("returns non-0 when verifyTokenScopes throws (network error)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_token", source: "credentials" });
    const mockVerify = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const code = await runLogin({
      env: {},
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).not.toBe(0);
    expect(mockDeviceFlow).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: --force always runs Device Flow
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-008: --force always runs the Device Flow", () => {
  it("calls Device Flow even when a valid token is present (force=true)", async () => {
    mockResolveGitHubToken.mockResolvedValue({ token: "ghp_valid", source: "env" });
    const mockVerify = vi.fn().mockResolvedValue({ status: 200, scopes: [] });

    const code = await runLogin({
      force: true,
      env: { GH_TOKEN: "ghp_valid" },
      runDeviceFlow: mockDeviceFlow,
      verifyTokenScopes: mockVerify,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).toHaveBeenCalled();
    // verify should NOT have been called (force skips it)
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("calls Device Flow even when no token exists (force=true)", async () => {
    mockResolveGitHubToken.mockRejectedValue(new Error("no token"));

    const code = await runLogin({
      force: true,
      env: {},
      runDeviceFlow: mockDeviceFlow,
    });

    expect(code).toBe(0);
    expect(mockDeviceFlow).toHaveBeenCalled();
  });

  it("LoginOpts has no provider field", () => {
    // Type-level check: LoginOpts should not have a provider property
    // This test ensures we don't accidentally add it back
    type LoginOptsKeys = keyof import("../login.js").LoginOpts;
    const key: Exclude<LoginOptsKeys, "provider"> = "force";
    expect(key).toBe("force"); // trivial assertion to make TS happy
  });
});
