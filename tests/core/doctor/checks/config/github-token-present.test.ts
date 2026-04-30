/**
 * TC-014: accessToken present → pass
 * TC-015: accessToken absent → fail
 */
import { describe, it, expect } from "vitest";
import { githubTokenPresentCheck } from "../../../../../src/core/doctor/checks/config/github-token-present.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

describe("githubTokenPresentCheck", () => {
  // TC-014
  it("returns pass when github.accessToken is a non-empty string", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ github: { accessToken: "ghp_test" } }),
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-015
  it("returns fail when github.accessToken is undefined", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ github: undefined }),
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });

  it("returns fail when github.accessToken is empty string", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ github: { accessToken: "" } }),
    });
    const result = await githubTokenPresentCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
