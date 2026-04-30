/**
 * TC-016: SPECRUNNER_GITHUB_CLIENT_ID not set → warn
 * TC-017: SPECRUNNER_GITHUB_CLIENT_ID set → pass
 */
import { describe, it, expect } from "vitest";
import { githubClientIdCheck } from "../../../../../src/core/doctor/checks/env/github-client-id.js";
import { buildMockContext } from "../../mock-context.js";

describe("githubClientIdCheck", () => {
  // TC-016
  it("returns warn when SPECRUNNER_GITHUB_CLIENT_ID is undefined", async () => {
    const ctx = buildMockContext({ env: {} });
    const result = await githubClientIdCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/login/i);
  });

  // TC-017
  it("returns pass when SPECRUNNER_GITHUB_CLIENT_ID is set", async () => {
    const ctx = buildMockContext({
      env: { SPECRUNNER_GITHUB_CLIENT_ID: "Ov23liABCDEFGH" },
    });
    const result = await githubClientIdCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});
