/**
 * TC-01: runPreflight — credentials 経由で githubTokenSource が伝搬される
 * TC-02: runPreflight — env 経由で githubTokenSource が伝搬される
 * TC-03: runPreflight — info ログに token source が出力される (credentials)
 * TC-04: runPreflight — info ログに token source が出力される (env)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ runtime: "local" }),
}));
vi.mock("../../src/config/schema.js", () => ({
  checkConfigComplete: vi.fn().mockReturnValue(null),
  resolveDesignLayerConfig: vi.fn().mockReturnValue({ enabled: false, command: "aozu", requireCitationTypes: [] }),
}));
vi.mock("../../src/core/design-layer/check-gate.js", () => ({
  runDesignLayerCheckGate: vi.fn().mockResolvedValue({ passed: true, skipped: true }),
}));
vi.mock("../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", repo: "test-repo" }),
}));
vi.mock("../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({
    type: "spec-change",
    title: "test",
    baseBranch: "main",
  }),
}));
vi.mock("../../src/logger/stdout.js", () => ({
  logInfo: vi.fn(),
}));
vi.mock("../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn(),
}));
vi.mock("../../src/core/credentials/anthropic.js", () => ({
  resolveSpecRunnerApiKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/core/credentials/requirements.js", () => ({
  requirementsFor: vi.fn().mockReturnValue([{ key: "github.token", envVar: "GITHUB_TOKEN" }]),
}));

import { runPreflight } from "../../src/core/preflight.js";
import { resolveGitHubToken } from "../../src/core/credentials/github.js";
import { logInfo } from "../../src/logger/stdout.js";
import { runDesignLayerCheckGate } from "../../src/core/design-layer/check-gate.js";
import { SpecRunnerError } from "../../src/errors.js";

describe("runPreflight — githubTokenSource propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-01
  it("returns githubTokenSource: credentials when resolveGitHubToken returns credentials", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_test",
      source: "credentials",
    });

    const result = await runPreflight("/fake/request.md", "/fake/cwd", {}, {
      prereqChecker: { check: vi.fn().mockResolvedValue(null) },
      credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
    });
    expect(result.githubTokenSource).toBe("credentials");
    expect(result.githubToken).toBe("ghp_test");
  });

  // TC-02
  it("returns githubTokenSource: env when resolveGitHubToken returns env", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_envtoken",
      source: "env",
    });

    const result = await runPreflight("/fake/request.md", "/fake/cwd", {}, {
      prereqChecker: { check: vi.fn().mockResolvedValue(null) },
      credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
    });
    expect(result.githubTokenSource).toBe("env");
    expect(result.githubToken).toBe("ghp_envtoken");
  });

  // TC-03
  it("logs 'GitHub token source: credentials' when source is credentials", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_test",
      source: "credentials",
    });

    await runPreflight("/fake/request.md", "/fake/cwd", {}, {
      prereqChecker: { check: vi.fn().mockResolvedValue(null) },
      credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
    });
    expect(vi.mocked(logInfo)).toHaveBeenCalledWith("GitHub token source: credentials");
  });

  // TC-04
  it("logs 'GitHub token source: env' when source is env", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_envtoken",
      source: "env",
    });

    await runPreflight("/fake/request.md", "/fake/cwd", {}, {
      prereqChecker: { check: vi.fn().mockResolvedValue(null) },
      credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
    });
    expect(vi.mocked(logInfo)).toHaveBeenCalledWith("GitHub token source: env");
  });
});

// ---------------------------------------------------------------------------
// TC-005: runPreflight + design-layer gate failure → throw SpecRunnerError
// ---------------------------------------------------------------------------
//
// Verifies the `if (!gateResult.passed) throw new SpecRunnerError(...)` branch
// in preflight.ts. The module-level mock for runDesignLayerCheckGate is overridden
// per-test to return passed:false.
// ---------------------------------------------------------------------------

describe("TC-005: runPreflight — design-layer gate failure → throws SpecRunnerError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveGitHubToken).mockResolvedValue({ token: "ghp_test", source: "credentials" });
  });

  it("throws SpecRunnerError with DESIGN_LAYER_CHECK_FAILED when gate returns passed:false", async () => {
    vi.mocked(runDesignLayerCheckGate).mockResolvedValueOnce({
      passed: false,
      exitCode: 1,
      diagnostics: "ERROR UNRESOLVED [[mod-foo]] not found in design/",
    });

    await expect(
      runPreflight("/fake/request.md", "/fake/cwd", {}, {
        prereqChecker: { check: vi.fn().mockResolvedValue(null) },
        credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
      }),
    ).rejects.toThrow(SpecRunnerError);
  });

  it("thrown error has DESIGN_LAYER_CHECK_FAILED code", async () => {
    vi.mocked(runDesignLayerCheckGate).mockResolvedValueOnce({
      passed: false,
      exitCode: 1,
      diagnostics: "ERROR UNRESOLVED [[mod-foo]] not found in design/",
    });

    let caughtError: unknown;
    try {
      await runPreflight("/fake/request.md", "/fake/cwd", {}, {
        prereqChecker: { check: vi.fn().mockResolvedValue(null) },
        credentialsResolver: { resolve: vi.fn().mockResolvedValue({}) },
      });
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(SpecRunnerError);
    expect((caughtError as SpecRunnerError).code).toBe("DESIGN_LAYER_CHECK_FAILED");
  });
});
