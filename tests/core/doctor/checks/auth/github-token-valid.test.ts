/**
 * TC-022: 200 (any scopes) → pass
 * TC-024: AbortError → warn
 * TC-065: uses githubClient.verifyTokenScopes not fetch
 */
import { describe, it, expect, vi } from "vitest";
import { githubTokenValidCheck } from "../../../../../src/core/doctor/checks/auth/github-token-valid.js";
import { buildMockContext, buildMockGitHubClient } from "../../mock-context.js";

describe("githubTokenValidCheck", () => {
  // TC-022
  it("returns pass when verifyTokenScopes returns 200", async () => {
    const githubClient = buildMockGitHubClient({
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo", "read:org"] }),
    });
    const ctx = buildMockContext({ githubClient, resolvedGitHubToken: "ghp_test" });
    const result = await githubTokenValidCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toBe("GitHub token is valid");
  });

  // TC-022b: GitHub App token (ghu_) has no classic scopes — must still pass
  it("returns pass when verifyTokenScopes returns 200 with no scopes (GitHub App token)", async () => {
    const githubClient = buildMockGitHubClient({
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: [] }),
    });
    const ctx = buildMockContext({ githubClient, resolvedGitHubToken: "ghu_test" });
    const result = await githubTokenValidCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toBe("GitHub token is valid");
  });

  // TC-024
  it("returns warn when verifyTokenScopes throws AbortError", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const githubClient = buildMockGitHubClient({
      verifyTokenScopes: vi.fn().mockRejectedValue(abortError),
    });
    const ctx = buildMockContext({ githubClient, resolvedGitHubToken: "ghp_test" });
    const result = await githubTokenValidCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/network timeout/i);
  });

  // TC-065
  it("uses githubClient.verifyTokenScopes and not fetch directly", async () => {
    const verifyTokenScopes = vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] });
    const githubClient = buildMockGitHubClient({ verifyTokenScopes });
    const mockFetch = vi.fn() as unknown as typeof fetch;
    const ctx = buildMockContext({ githubClient, fetch: mockFetch, resolvedGitHubToken: "ghp_test" });
    await githubTokenValidCheck.check(ctx);
    expect(verifyTokenScopes).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns fail when 401 is returned", async () => {
    const githubClient = buildMockGitHubClient({
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 401, scopes: [] }),
    });
    const ctx = buildMockContext({ githubClient, resolvedGitHubToken: "ghp_test" });
    const result = await githubTokenValidCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when token is not configured", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: null,
    });
    const result = await githubTokenValidCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("GH_TOKEN");
    expect(result.hint).toContain("gh auth login");
    expect(result.hint).toContain("specrunner login");
  });
});
