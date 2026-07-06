/**
 * Integration-style tests for doctor config overlay wiring.
 *
 * Verifies that `runDoctor` uses `loadConfigWithOverlay` so that
 * project-local config settings (runtime, designLayer, etc.) reach
 * the checks via ctx.config.
 *
 * TC-DR-10: project-local runtime overlay reaches ctx.config
 * TC-DR-11: outside git repo — user-global only, no crash
 * TC-DR-12: configLoadError propagates to ctx.config.loadError
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock loadConfigWithOverlay ────────────────────────────────────────────────
vi.mock("../load-config-with-overlay.js", () => ({
  loadConfigWithOverlay: vi.fn(),
}));

// ── Mock runChecks to capture ctx without running real checks ─────────────────
vi.mock("../../core/doctor/runner.js", () => ({
  runChecks: vi.fn(),
}));

// ── Mock checks index to avoid importing real check deps ─────────────────────
vi.mock("../../core/doctor/checks/index.js", () => ({
  commonChecks: [],
  managedChecks: [],
  localChecks: [],
}));

// ── Mock formatters ───────────────────────────────────────────────────────────
vi.mock("../../core/doctor/formatter.js", () => ({
  formatHuman: vi.fn().mockReturnValue(""),
  formatJson: vi.fn().mockReturnValue("{}"),
}));

// ── Mock credentials resolvers ────────────────────────────────────────────────
vi.mock("../../core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "ghp_mock", source: "env" }),
}));

vi.mock("../../core/credentials/anthropic.js", () => ({
  resolveSpecRunnerApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../core/credentials/claude-code.js", () => ({
  resolveClaudeCodeOAuthToken: vi.fn().mockResolvedValue(null),
}));

// ── Mock GitHub host resolution ───────────────────────────────────────────────
vi.mock("../../config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

// ── Mock GitHub client factory ────────────────────────────────────────────────
vi.mock("../../adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({ verifyTokenScopes: vi.fn() }),
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock("../../logger/stdout.js", () => ({
  stdoutWrite: vi.fn(),
}));

import { runDoctor } from "../doctor.js";
import { loadConfigWithOverlay } from "../load-config-with-overlay.js";
import { runChecks } from "../../core/doctor/runner.js";
import type { DoctorContext, DoctorResult } from "../../core/doctor/types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

const mockLoadConfigWithOverlay = vi.mocked(loadConfigWithOverlay);
const mockRunChecks = vi.mocked(runChecks);

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    ...overrides,
  } as SpecRunnerConfig;
}

function makePassResult(name: string): DoctorResult {
  return { name, category: "config", required: false, status: "pass", message: "ok" };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: runChecks returns empty array (no fails → exit 0)
  mockRunChecks.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-10: project-local runtime overlay reaches ctx.config
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-10: project-local runtime overlay reaches ctx.config", () => {
  it("ctx.config.get('runtime') returns the mocked runtime value", async () => {
    mockLoadConfigWithOverlay.mockResolvedValue(makeConfig({ runtime: "managed" }));

    let capturedCtx: DoctorContext | undefined;
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      capturedCtx = ctx;
      return [];
    });

    await runDoctor({ json: false });

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.config.get("runtime")).toBe("managed");
  });

  it("designLayer overlay reaches ctx.config", async () => {
    mockLoadConfigWithOverlay.mockResolvedValue(
      makeConfig({ designLayer: { enabled: true } } as Partial<SpecRunnerConfig>),
    );

    let capturedCtx: DoctorContext | undefined;
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      capturedCtx = ctx;
      return [];
    });

    await runDoctor({ json: false });

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.config.get("designLayer.enabled")).toBe(true);
  });

  it("managed runtime triggers managedChecks set in the assembled checks array", async () => {
    // Re-import checks mock to assert it receives the right set
    mockLoadConfigWithOverlay.mockResolvedValue(makeConfig({ runtime: "managed" }));

    let capturedChecks: unknown[] = [];
    mockRunChecks.mockImplementation(async (checks, _ctx) => {
      capturedChecks = checks;
      return [];
    });

    // Provide a recognizable managed check in the mock
    const { managedChecks } = await import("../../core/doctor/checks/index.js");
    (managedChecks as unknown[]).push({ name: "managed-only", category: "auth", required: false });

    await runDoctor({ json: false });

    // managedChecks were included (runtime === "managed")
    expect(capturedChecks).toEqual(expect.arrayContaining(managedChecks));

    // Restore
    managedChecks.length = 0;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-11: outside git repo — user-global only, no crash
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-11: outside git repo — user-global only, runDoctor exits cleanly", () => {
  it("returns 0 when loadConfigWithOverlay returns minimal config and all checks pass", async () => {
    mockLoadConfigWithOverlay.mockResolvedValue(makeConfig());
    mockRunChecks.mockResolvedValue([makePassResult("config-file-exists")]);

    const code = await runDoctor({ json: false });

    expect(code).toBe(0);
  });

  it("calls loadConfigWithOverlay exactly once", async () => {
    mockLoadConfigWithOverlay.mockResolvedValue(makeConfig());

    await runDoctor({ json: false });

    expect(mockLoadConfigWithOverlay).toHaveBeenCalledTimes(1);
  });

  it("ctx.config.loaded is true when config loads successfully", async () => {
    mockLoadConfigWithOverlay.mockResolvedValue(makeConfig());

    let capturedCtx: DoctorContext | undefined;
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      capturedCtx = ctx;
      return [];
    });

    await runDoctor({ json: false });

    expect(capturedCtx!.config.loaded).toBe(true);
    expect(capturedCtx!.config.loadError).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DR-12: configLoadError propagates to ctx.config.loadError
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-DR-12: configLoadError propagates when loadConfigWithOverlay throws", () => {
  it("ctx.config.loadError is set to the error message", async () => {
    mockLoadConfigWithOverlay.mockRejectedValue(new Error("Config file not found: ENOENT"));

    let capturedCtx: DoctorContext | undefined;
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      capturedCtx = ctx;
      return [];
    });

    await runDoctor({ json: false });

    expect(capturedCtx!.config.loadError).toBe("Config file not found: ENOENT");
  });

  it("ctx.config.loaded is false when loadConfigWithOverlay throws", async () => {
    mockLoadConfigWithOverlay.mockRejectedValue(new Error("ENOENT"));

    let capturedCtx: DoctorContext | undefined;
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      capturedCtx = ctx;
      return [];
    });

    await runDoctor({ json: false });

    expect(capturedCtx!.config.loaded).toBe(false);
  });

  it("returns 1 when runChecks includes a fail result due to config load error", async () => {
    mockLoadConfigWithOverlay.mockRejectedValue(new Error("ENOENT"));

    // Simulate what config-file-exists check would return when loadError is set
    mockRunChecks.mockImplementation(async (_checks, ctx) => {
      return [
        {
          name: "config-file-exists",
          category: "config" as const,
          required: true,
          status: "fail" as const,
          message: `Config file is malformed: ${ctx.config.loadError}`,
        },
      ];
    });

    const code = await runDoctor({ json: false });

    expect(code).toBe(1);
  });
});
