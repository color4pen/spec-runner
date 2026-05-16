/**
 * TC-014: accessToken present → pass
 * TC-015: accessToken absent → fail
 */
import { describe, it, expect } from "vitest";
import { githubTokenPresentCheck } from "../../../../../src/core/doctor/checks/config/github-token-present.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

describe("githubTokenPresentCheck", () => {
  // TC-014
  it("returns pass when resolvedGitHubToken is a non-empty string", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_test",
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-015
  it("returns fail when resolvedGitHubToken is null", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: null,
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when resolvedGitHubToken is empty string", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "",
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  // TC-05: source: credentials in pass message
  it("includes source: credentials in pass message", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_test",
      githubTokenSource: "credentials",
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("(source: credentials)");
  });

  // TC-06: source: env in pass message
  it("includes source: env in pass message", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_test",
      githubTokenSource: "env",
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("(source: env)");
  });

  // TC-07: token absent — fail, no source label
  it("returns fail with no source label when token is null", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: null,
      githubTokenSource: null,
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).not.toContain("(source:");
  });

  // TC-08: githubTokenSource null but token present — pass without source label
  it("returns pass without source label when githubTokenSource is null", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_test",
      githubTokenSource: null,
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.message).toBe("GitHub token is available");
  });
});
