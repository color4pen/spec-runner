/**
 * TC-014: accessToken present → pass
 * TC-015: accessToken absent → fail
 */
import { describe, it, expect } from "vitest";
import { githubTokenPresentCheck } from "../../../../../src/core/doctor/checks/config/github-token-present.js";
import { buildMockContext } from "../../mock-context.js";

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
    expect(result.hint).toContain("GH_TOKEN");
    expect(result.hint).toContain("gh auth login");
    expect(result.hint).toContain("specrunner login");
  });

  it("returns fail when resolvedGitHubToken is empty string", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "",
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("GH_TOKEN");
    expect(result.hint).toContain("gh auth login");
    expect(result.hint).toContain("specrunner login");
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
      env: { GH_TOKEN: "ghp_test" },
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
    expect(result.hint).toContain("GH_TOKEN");
    expect(result.hint).toContain("gh auth login");
    expect(result.hint).toContain("specrunner login");
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

  // TC-09: source env, GH_TOKEN set → details shows $GH_TOKEN
  it("shows Resolved via $GH_TOKEN in details when source is env and GH_TOKEN is set", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_test",
      githubTokenSource: "env",
      env: { GH_TOKEN: "ghp_test" },
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.details).toBeDefined();
    expect(result.details).toContain("Resolved via $GH_TOKEN");
  });

  // TC-10: source env, only GITHUB_TOKEN set → details shows $GITHUB_TOKEN
  it("shows Resolved via $GITHUB_TOKEN in details when source is env and only GITHUB_TOKEN is set", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_actions",
      githubTokenSource: "env",
      env: { GITHUB_TOKEN: "ghp_actions" },
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.details).toBeDefined();
    expect(result.details).toContain("Resolved via $GITHUB_TOKEN");
  });

  // TC-11: source gh → no details
  it("does not add details when source is gh", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_gh_cli",
      githubTokenSource: "gh",
      env: {},
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.details).toBeUndefined();
  });

  // TC-12: source credentials → no details
  it("does not add details when source is credentials", async () => {
    const ctx = buildMockContext({
      resolvedGitHubToken: "ghp_creds",
      githubTokenSource: "credentials",
      env: {},
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
    expect(result.details).toBeUndefined();
  });
});
