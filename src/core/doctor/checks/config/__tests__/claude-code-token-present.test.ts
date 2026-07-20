/**
 * Unit tests for claudeCodeTokenPresentCheck doctor check.
 *
 * TC-008: doctor reports env source
 * TC-009: doctor reports credentials source
 * TC-010: doctor reports unset source
 */
import { describe, it, expect, vi } from "vitest";
import { claudeCodeTokenPresentCheck } from "../claude-code-token-present.js";
import type { DoctorContext } from "../../../types.js";

function makeCtx(overrides: Partial<DoctorContext> = {}): DoctorContext {
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
    execFile: vi.fn(),
    config: { get: vi.fn(), loaded: true },
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
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: doctor reports env source
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-008: doctor reports env source when CLAUDE_CODE_OAUTH_TOKEN is set", () => {
  it("returns pass with source:env label", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: "env-token",
      claudeCodeOAuthTokenSource: "env",
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/env/i);
  });

  it("does NOT include the token value in the message or details", async () => {
    const secretToken = "super-secret-env-token-abc123";
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: secretToken,
      claudeCodeOAuthTokenSource: "env",
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.message).not.toContain(secretToken);
    const detailsText = (result.details ?? []).join("");
    expect(detailsText).not.toContain(secretToken);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: doctor reports credentials source
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-009: doctor reports credentials source when token is in credentials.json", () => {
  it("returns pass with credentials.json source label", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: "cred-token",
      claudeCodeOAuthTokenSource: "credentials",
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/credentials/i);
  });

  it("does NOT include the token value in the message or details", async () => {
    const secretToken = "cred-secret-token-xyz789";
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: secretToken,
      claudeCodeOAuthTokenSource: "credentials",
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.message).not.toContain(secretToken);
    const detailsText = (result.details ?? []).join("");
    expect(detailsText).not.toContain(secretToken);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: doctor reports unset source
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-010: doctor reports unset when neither env nor credentials have token", () => {
  it("returns warn when token is unset", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: null,
      claudeCodeOAuthTokenSource: null,
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.status).toBe("warn");
  });

  it("hint mentions claude setup-token and specrunner login --provider claude", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: null,
      claudeCodeOAuthTokenSource: null,
    });

    const result = await claudeCodeTokenPresentCheck.check(ctx);

    expect(result.hint).toMatch(/claude setup-token/i);
    expect(result.hint).toMatch(/specrunner login --provider claude/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON output — source is testable from context
// ─────────────────────────────────────────────────────────────────────────────
describe("doctor JSON output — source metadata is stable and testable", () => {
  it("env source produces a stable pass message containing 'env'", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: "tok",
      claudeCodeOAuthTokenSource: "env",
    });
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("env");
  });

  it("credentials source produces a stable pass message containing 'credentials'", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: "tok",
      claudeCodeOAuthTokenSource: "credentials",
    });
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("credentials");
  });

  it("unset produces a stable warn status", async () => {
    const ctx = makeCtx({
      resolvedClaudeCodeOAuthToken: null,
      claudeCodeOAuthTokenSource: null,
    });
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.status).toBe("warn");
  });
});
