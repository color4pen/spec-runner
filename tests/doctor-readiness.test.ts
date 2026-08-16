/**
 * Tests for doctor readiness formatting.
 *
 * TC-015: headless Claude credential unset doctor result is warn with cron/inbox note
 * TC-016: warn present but fail=0 → formatHuman shows Ready + next step
 * TC-017: fail>0 → formatHuman does NOT show Ready
 */
import { describe, it, expect, vi } from "vitest";
import { formatHuman } from "../src/core/doctor/formatter.js";
import { claudeCodeTokenPresentCheck } from "../src/core/doctor/checks/config/claude-code-token-present.js";
import type { DoctorResult } from "../src/core/doctor/types.js";
import type { DoctorContext } from "../src/core/doctor/types.js";

function makePassResult(name: string): DoctorResult {
  return {
    name,
    category: "config",
    required: true,
    status: "pass",
    message: `${name} is OK`,
  };
}

function makeWarnResult(name: string): DoctorResult {
  return {
    name,
    category: "config",
    required: false,
    status: "warn",
    message: `${name} warning`,
    hint: "Fix this optional thing.",
  };
}

function makeFailResult(name: string): DoctorResult {
  return {
    name,
    category: "config",
    required: true,
    status: "fail",
    message: `${name} failed`,
    hint: "Fix this required thing.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: headless Claude credential unset is warn with cron/inbox note
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: headless Claude credential unset is warn and includes cron/inbox note", () => {
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

  it("returns warn when token is unset", async () => {
    const ctx = makeCtx();
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.status).toBe("warn");
  });

  it("hint contains credentials set claude-code", async () => {
    const ctx = makeCtx();
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.hint).toContain("credentials set claude-code");
  });

  it("hint contains cron/inbox/headless note", async () => {
    const ctx = makeCtx();
    const result = await claudeCodeTokenPresentCheck.check(ctx);
    expect(result.hint).toMatch(/cron|inbox|headless/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: warn present + fail=0 → formatHuman shows Ready + next step
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: warn present + fail=0 → formatHuman shows Ready and next step", () => {
  it("shows 'Ready to run.' when fail=0 (all pass)", () => {
    const results: DoctorResult[] = [
      makePassResult("check-a"),
      makePassResult("check-b"),
    ];

    const output = formatHuman(results);
    expect(output).toContain("Ready to run.");
  });

  it("shows 'Ready to run.' when fail=0 but warn present", () => {
    const results: DoctorResult[] = [
      makePassResult("check-a"),
      makeWarnResult("optional-check"),
    ];

    const output = formatHuman(results);
    expect(output).toContain("Ready to run.");
  });

  it("shows next step command with 'specrunner request new'", () => {
    const results: DoctorResult[] = [
      makePassResult("check-a"),
    ];

    const output = formatHuman(results);
    expect(output).toContain("specrunner request new");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: fail>0 → formatHuman does NOT show Ready
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: fail>0 → formatHuman does not show Ready", () => {
  it("does not show 'Ready to run.' when fail>0", () => {
    const results: DoctorResult[] = [
      makePassResult("check-a"),
      makeFailResult("required-check"),
    ];

    const output = formatHuman(results);
    expect(output).not.toContain("Ready to run.");
  });

  it("still shows fail information when fail>0", () => {
    const results: DoctorResult[] = [
      makeFailResult("required-check"),
    ];

    const output = formatHuman(results);
    expect(output).toContain("fail");
    // Summary should mention the fail count
    expect(output).toContain("1 fail");
  });
});
