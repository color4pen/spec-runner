/**
 * TC-022, TC-023, TC-024, TC-065
 * Validate GitHub token via GitHubClient port verifyTokenScopes().
 * Must contain "repo" scope.
 * Timeout = warn, not fail (network may be unreachable).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubTokenValidCheck: DoctorCheck = {
  name: "github-token-valid",
  category: "auth",
  required: true,

  async check(ctx: DoctorContext) {
    const token = ctx.config.get("github.accessToken");
    if (typeof token !== "string" || token.length === 0) {
      return {
        status: "fail",
        message: "github.accessToken is not configured — cannot validate",
        hint: "Run 'specrunner login' first.",
      };
    }

    try {
      const result = await ctx.githubClient.verifyTokenScopes();

      if (result.status === 401) {
        return {
          status: "fail",
          message: "GitHub token is invalid or expired (HTTP 401)",
          hint: "Run 'specrunner login' to re-authenticate.",
        };
      }

      if (result.status !== 200) {
        return {
          status: "warn",
          message: `GitHub API returned HTTP ${result.status} — cannot confirm token validity`,
          hint: "Check connectivity and retry.",
        };
      }

      const hasRepoScope = result.scopes.includes("repo");
      if (!hasRepoScope) {
        return {
          status: "fail",
          message: `GitHub token is missing required scope 'repo'. Current scopes: ${result.scopes.join(", ") || "(none)"}`,
          hint: "Run 'specrunner login' to re-authenticate with the correct scopes.",
        };
      }

      return {
        status: "pass",
        message: `GitHub token is valid with required scopes (repo ✓)`,
      };
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort") || err.message.includes("The operation was aborted"));
      if (isAbort) {
        return {
          status: "warn",
          message: "network timeout contacting GitHub API (5s)",
          hint: "Check connectivity and retry.",
        };
      }
      return {
        status: "warn",
        message: `Cannot reach GitHub API: ${(err as Error).message}`,
        hint: "Check connectivity and retry.",
      };
    }
  },
};
