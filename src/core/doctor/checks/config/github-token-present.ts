/**
 * TC-014, TC-015
 * Check that a GitHub token is resolvable (credentials file or GITHUB_TOKEN env var).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubTokenPresentCheck: DoctorCheck = {
  name: "github-token-present",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    if (typeof ctx.resolvedGitHubToken === "string" && ctx.resolvedGitHubToken.length > 0) {
      const sourceLabel = ctx.githubTokenSource ? ` (source: ${ctx.githubTokenSource})` : "";
      return {
        status: "pass",
        message: `GitHub token is available${sourceLabel}`,
      };
    }

    return {
      status: "fail",
      message: "GitHub token not found",
      hint: "Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'.",
    };
  },
};
