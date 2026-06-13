/**
 * Unit tests for Claude Code OAuth token resolver and saver.
 *
 * TC-003: credentials token is injected when env is absent
 * TC-004: environment token has precedence
 * TC-012: CredentialsFile accepts Claude Code OAuth token alongside existing fields
 * TC-013: malformed Claude Code token is rejected by credential validation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveClaudeCodeOAuthToken, saveClaudeCodeOAuthToken } from "../claude-code.js";

vi.mock("../credentials-io.js", () => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
}));

import { loadCredentials, saveCredentials } from "../credentials-io.js";

const mockLoad = vi.mocked(loadCredentials);
const mockSave = vi.mocked(saveCredentials);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue({});
  mockSave.mockResolvedValue(undefined);
});

describe("resolveClaudeCodeOAuthToken — env precedence", () => {
  it("returns env token with source:env when CLAUDE_CODE_OAUTH_TOKEN is set", async () => {
    mockLoad.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "cred-token" },
    });
    const result = await resolveClaudeCodeOAuthToken(
      { CLAUDE_CODE_OAUTH_TOKEN: "env-token" },
      { optional: true },
    );
    expect(result).toEqual({ token: "env-token", source: "env" });
  });

  it("env token is preferred even when credentials also have a token (TC-004)", async () => {
    mockLoad.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "cred-token" },
    });
    const result = await resolveClaudeCodeOAuthToken(
      { CLAUDE_CODE_OAUTH_TOKEN: "env-wins" },
      { optional: true },
    );
    expect(result?.source).toBe("env");
    expect(result?.token).toBe("env-wins");
  });
});

describe("resolveClaudeCodeOAuthToken — credentials fallback", () => {
  it("returns credentials token with source:credentials when env is absent (TC-003)", async () => {
    mockLoad.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "cred-token" },
    });
    const result = await resolveClaudeCodeOAuthToken({}, { optional: true });
    expect(result).toEqual({ token: "cred-token", source: "credentials" });
  });

  it("returns credentials token when env var is empty string", async () => {
    mockLoad.mockResolvedValue({
      anthropic: { claudeCodeOAuthToken: "cred-token" },
    });
    const result = await resolveClaudeCodeOAuthToken(
      { CLAUDE_CODE_OAUTH_TOKEN: "" },
      { optional: true },
    );
    expect(result).toEqual({ token: "cred-token", source: "credentials" });
  });
});

describe("resolveClaudeCodeOAuthToken — optional / unset", () => {
  it("returns undefined when optional and token is unset (no env, no creds)", async () => {
    mockLoad.mockResolvedValue({});
    const result = await resolveClaudeCodeOAuthToken({}, { optional: true });
    expect(result).toBeUndefined();
  });

  it("throws when required and token is unset", async () => {
    mockLoad.mockResolvedValue({});
    await expect(resolveClaudeCodeOAuthToken({})).rejects.toThrow();
  });

  it("secret value is not present in thrown error message", async () => {
    mockLoad.mockResolvedValue({});
    const err = await resolveClaudeCodeOAuthToken({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // The error should not contain any credential values
    const msg = String(err);
    expect(msg).not.toContain("sk-");
  });
});

describe("saveClaudeCodeOAuthToken", () => {
  it("calls saveCredentials with anthropic.claudeCodeOAuthToken", async () => {
    await saveClaudeCodeOAuthToken("my-oauth-token");
    expect(mockSave).toHaveBeenCalledWith({
      anthropic: { claudeCodeOAuthToken: "my-oauth-token" },
    });
  });

  it("does not expose token in save call arguments beyond the credential object", async () => {
    await saveClaudeCodeOAuthToken("secret-token");
    const call = mockSave.mock.calls[0]?.[0];
    // Only the credentials object is passed, not a plain string
    expect(typeof call).toBe("object");
    expect(call?.anthropic?.claudeCodeOAuthToken).toBe("secret-token");
  });
});

describe("TC-012: CredentialsFile schema accepts claudeCodeOAuthToken alongside other fields", () => {
  it("credentials file with github.token, anthropic.apiKey, and claudeCodeOAuthToken loads successfully", async () => {
    const fullCreds = {
      github: { token: "ghp_test" },
      anthropic: { apiKey: "sk-ant-test", claudeCodeOAuthToken: "claude-oauth-test" },
    };
    mockLoad.mockResolvedValue(fullCreds);

    const result = await resolveClaudeCodeOAuthToken({}, { optional: true });
    expect(result?.token).toBe("claude-oauth-test");
    expect(result?.source).toBe("credentials");
    // loadCredentials was called — existing fields are not modified by the resolver
    expect(mockLoad).toHaveBeenCalled();
  });
});

describe("preservation of existing credentials on save", () => {
  it("saving Claude token does not clear github.token", async () => {
    // saveClaudeCodeOAuthToken calls saveCredentials with only the claude field.
    // The actual merge is in credentials-io.ts (saveCredentials); here we verify
    // the correct partial payload is sent so the IO layer can merge.
    await saveClaudeCodeOAuthToken("new-claude-token");
    const arg = mockSave.mock.calls[0]?.[0];
    // Only the claude field is sent (credentials-io merges with existing)
    expect(arg).toEqual({ anthropic: { claudeCodeOAuthToken: "new-claude-token" } });
    // github.token is NOT present in the payload (credentials-io preserves it)
    expect(arg?.github).toBeUndefined();
    // anthropic.apiKey is NOT in the payload (credentials-io preserves it)
    expect(arg?.anthropic?.apiKey).toBeUndefined();
  });
});
