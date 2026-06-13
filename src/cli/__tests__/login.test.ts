/**
 * Unit tests for specrunner login CLI.
 *
 * TC-001: login stores Claude Code token
 * TC-002: login does not overwrite without force
 * TC-015: login with --force overwrites an existing Claude token
 * TC-016: login warns when CLAUDE_CODE_OAUTH_TOKEN is already set
 * TC-017: empty Claude login input is rejected
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLogin } from "../login.js";

// ── Mock credentials-io (login.ts → github.ts re-exports from credentials-io) ─
// login.ts imports `loadCredentials` from `../core/credentials/github.js`,
// which re-exports from `credentials-io.js`. We mock the re-exporting module.
vi.mock("../../core/credentials/github.js", () => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn().mockResolvedValue(undefined),
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "ghp_mock", source: "env" }),
}));

// ── Mock claude-code saver ────────────────────────────────────────────────────
vi.mock("../../core/credentials/claude-code.js", () => ({
  saveClaudeCodeOAuthToken: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock device flow (GitHub login path) ────────────────────────────────────
vi.mock("../../auth/github-device.js", () => ({
  runDeviceFlow: vi.fn().mockResolvedValue({ accessToken: "ghp_mock" }),
}));

// ── Mock config store (GitHub login scaffold) ────────────────────────────────
vi.mock("../../config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, agents: {} }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock github-host resolution ──────────────────────────────────────────────
vi.mock("../../config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

// ── Mock logger to capture output without printing ──────────────────────────
vi.mock("../../logger/stdout.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logSuccess: vi.fn(),
  stderrWrite: vi.fn(),
}));

import { loadCredentials } from "../../core/credentials/github.js";
import { saveClaudeCodeOAuthToken } from "../../core/credentials/claude-code.js";
import { logWarn, logError, logSuccess } from "../../logger/stdout.js";

const mockLoadCredentials = vi.mocked(loadCredentials);
const mockSaveClaudeCode = vi.mocked(saveClaudeCodeOAuthToken);
const mockLogWarn = vi.mocked(logWarn);
const mockLogError = vi.mocked(logError);
const mockLogSuccess = vi.mocked(logSuccess);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadCredentials.mockResolvedValue({});
  mockSaveClaudeCode.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: login stores Claude Code token
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: specrunner login --provider claude — stores token", () => {
  it("stores the pasted token via saveClaudeCodeOAuthToken and exits 0", async () => {
    const promptToken = vi.fn().mockResolvedValue("my-oauth-token");
    const code = await runLogin({
      provider: "claude",
      env: {},
      promptToken,
    });

    expect(code).toBe(0);
    expect(mockSaveClaudeCode).toHaveBeenCalledWith("my-oauth-token");
  });

  it("trims surrounding whitespace from the pasted token", async () => {
    const promptToken = vi.fn().mockResolvedValue("  trimmed-token  ");
    await runLogin({ provider: "claude", env: {}, promptToken });
    expect(mockSaveClaudeCode).toHaveBeenCalledWith("trimmed-token");
  });

  it("does not print the token value in logSuccess output", async () => {
    const token = "super-secret-oauth-token";
    const promptToken = vi.fn().mockResolvedValue(token);
    await runLogin({ provider: "claude", env: {}, promptToken });
    for (const call of mockLogSuccess.mock.calls) {
      expect(String(call[0])).not.toContain(token);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: login does not overwrite without force
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: specrunner login --provider claude — does not overwrite without --force", () => {
  it("retains existing token and exits 0 when token already stored and force is false", async () => {
    mockLoadCredentials.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "existing-token" },
    });
    const promptToken = vi.fn();
    const code = await runLogin({ provider: "claude", env: {}, force: false, promptToken });

    expect(code).toBe(0);
    expect(promptToken).not.toHaveBeenCalled();
    expect(mockSaveClaudeCode).not.toHaveBeenCalled();
  });

  it("emits a warn telling user how to overwrite (--force)", async () => {
    mockLoadCredentials.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "existing-token" },
    });
    const promptToken = vi.fn();
    await runLogin({ provider: "claude", env: {}, force: false, promptToken });

    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining("--force"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: login with --force overwrites an existing Claude token
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: specrunner login --provider claude --force — overwrites existing token", () => {
  it("proceeds with prompt and saves new token even when existing token is present", async () => {
    mockLoadCredentials.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "old-token" },
    });
    const promptToken = vi.fn().mockResolvedValue("new-token");
    const code = await runLogin({ provider: "claude", env: {}, force: true, promptToken });

    expect(code).toBe(0);
    expect(mockSaveClaudeCode).toHaveBeenCalledWith("new-token");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: login warns when CLAUDE_CODE_OAUTH_TOKEN is already set
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: specrunner login --provider claude — warns when env token is set", () => {
  it("warns that env var will take precedence when CLAUDE_CODE_OAUTH_TOKEN is set", async () => {
    const promptToken = vi.fn().mockResolvedValue("stored-token");
    await runLogin({
      provider: "claude",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "env-value" },
      promptToken,
    });

    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining("$CLAUDE_CODE_OAUTH_TOKEN"));
  });

  it("warning does not print the token value", async () => {
    const secretToken = "secret-env-value-12345";
    const promptToken = vi.fn().mockResolvedValue("stored-token");
    await runLogin({
      provider: "claude",
      env: { CLAUDE_CODE_OAUTH_TOKEN: secretToken },
      promptToken,
    });

    for (const call of mockLogWarn.mock.calls) {
      expect(String(call[0])).not.toContain(secretToken);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: empty Claude login input is rejected
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: specrunner login --provider claude — empty input is rejected", () => {
  it("exits 1 and does not save when user provides empty string", async () => {
    const promptToken = vi.fn().mockResolvedValue("");
    const code = await runLogin({ provider: "claude", env: {}, promptToken });

    expect(code).toBe(1);
    expect(mockSaveClaudeCode).not.toHaveBeenCalled();
  });

  it("exits 1 when user provides whitespace-only input", async () => {
    const promptToken = vi.fn().mockResolvedValue("   ");
    const code = await runLogin({ provider: "claude", env: {}, promptToken });

    expect(code).toBe(1);
    expect(mockSaveClaudeCode).not.toHaveBeenCalled();
  });

  it("emits logError for empty input", async () => {
    const promptToken = vi.fn().mockResolvedValue("");
    await runLogin({ provider: "claude", env: {}, promptToken });
    expect(mockLogError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider dispatch: bare login still uses GitHub flow
// ─────────────────────────────────────────────────────────────────────────────
describe("provider dispatch — bare specrunner login uses GitHub flow", () => {
  it("does not call saveClaudeCodeOAuthToken when provider is github (default)", async () => {
    const code = await runLogin({ provider: "github", env: {} });
    expect(mockSaveClaudeCode).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it("does not call saveClaudeCodeOAuthToken when provider is omitted", async () => {
    const code = await runLogin({ env: {} });
    expect(mockSaveClaudeCode).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });
});
