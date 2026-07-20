/**
 * TC-007: token 不在の hint が specrunner login を第一処方にする
 *
 * Source: spec.md > token 系 hint は `specrunner login` に一本化する
 *         > Scenario: token 不在
 */
import { describe, it, expect } from "vitest";
import { githubTokenPresentCheck } from "../../../src/core/doctor/checks/config/github-token-present.js";
import { githubTokenValidCheck } from "../../../src/core/doctor/checks/auth/github-token-valid.js";
import { buildMockContext } from "../../core/doctor/mock-context.js";

describe("TC-007: token 不在の hint は specrunner login を第一処方にする", () => {
  describe("github-token-present: token 不在の場合", () => {
    it("hint が定義されている", async () => {
      const ctx = buildMockContext({
        resolvedGitHubToken: null,
        githubTokenSource: null,
      });
      const result = await githubTokenPresentCheck.check(ctx);
      expect(result.status).toBe("fail");
      expect(result.hint).toBeDefined();
    });

    it("hint の第一処方が 'specrunner login' を含む", async () => {
      const ctx = buildMockContext({
        resolvedGitHubToken: null,
        githubTokenSource: null,
      });
      const result = await githubTokenPresentCheck.check(ctx);
      expect(result.status).toBe("fail");
      const hint = result.hint ?? "";
      // First prescription must mention specrunner login
      expect(hint).toContain("specrunner login");
      // specrunner login must appear before GH_TOKEN and gh auth login
      const loginIdx = hint.indexOf("specrunner login");
      const ghTokenIdx = hint.indexOf("GH_TOKEN");
      const ghAuthIdx = hint.indexOf("gh auth login");
      if (ghTokenIdx !== -1) {
        expect(loginIdx).toBeLessThan(ghTokenIdx);
      }
      if (ghAuthIdx !== -1) {
        expect(loginIdx).toBeLessThan(ghAuthIdx);
      }
    });

    it("token が有効な場合は pass を返す（回帰防止）", async () => {
      const ctx = buildMockContext({
        resolvedGitHubToken: "ghp_test123",
        githubTokenSource: "credentials",
      });
      const result = await githubTokenPresentCheck.check(ctx);
      expect(result.status).toBe("pass");
    });
  });

  describe("github-token-valid: token が無い場合の hint", () => {
    it("token 不在の fail hint に 'specrunner login' が含まれる", async () => {
      const ctx = buildMockContext({
        resolvedGitHubToken: null,
        githubTokenSource: null,
      });
      const result = await githubTokenValidCheck.check(ctx);
      expect(result.status).toBe("fail");
      const hint = result.hint ?? "";
      expect(hint).toContain("specrunner login");
      // specrunner login must appear first (before GH_TOKEN and gh)
      const loginIdx = hint.indexOf("specrunner login");
      const ghTokenIdx = hint.indexOf("GH_TOKEN");
      const ghAuthIdx = hint.indexOf("gh auth login");
      if (ghTokenIdx !== -1) {
        expect(loginIdx).toBeLessThan(ghTokenIdx);
      }
      if (ghAuthIdx !== -1) {
        expect(loginIdx).toBeLessThan(ghAuthIdx);
      }
    });
  });
});
