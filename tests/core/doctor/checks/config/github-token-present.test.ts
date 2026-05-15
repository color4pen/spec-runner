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
});
