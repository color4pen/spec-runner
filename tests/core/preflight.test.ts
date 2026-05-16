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

import { runPreflight } from "../../src/core/preflight.js";
import { resolveGitHubToken } from "../../src/core/credentials/github.js";
import { logInfo } from "../../src/logger/stdout.js";

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

    const result = await runPreflight("/fake/request.md", "/fake/cwd");
    expect(result.githubTokenSource).toBe("credentials");
    expect(result.githubToken).toBe("ghp_test");
  });

  // TC-02
  it("returns githubTokenSource: env when resolveGitHubToken returns env", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_envtoken",
      source: "env",
    });

    const result = await runPreflight("/fake/request.md", "/fake/cwd");
    expect(result.githubTokenSource).toBe("env");
    expect(result.githubToken).toBe("ghp_envtoken");
  });

  // TC-03
  it("logs 'GitHub token source: credentials' when source is credentials", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_test",
      source: "credentials",
    });

    await runPreflight("/fake/request.md", "/fake/cwd");
    expect(vi.mocked(logInfo)).toHaveBeenCalledWith("GitHub token source: credentials");
  });

  // TC-04
  it("logs 'GitHub token source: env' when source is env", async () => {
    vi.mocked(resolveGitHubToken).mockResolvedValue({
      token: "ghp_envtoken",
      source: "env",
    });

    await runPreflight("/fake/request.md", "/fake/cwd");
    expect(vi.mocked(logInfo)).toHaveBeenCalledWith("GitHub token source: env");
  });
});
