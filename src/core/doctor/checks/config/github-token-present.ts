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
      const details: string[] = [];

      if (ctx.githubTokenSource === "env") {
        // Identify which env var was used (GH_TOKEN takes precedence)
        const ghToken = ctx.env["GH_TOKEN"];
        const resolvedVarName =
          ghToken && ghToken.length > 0 ? "GH_TOKEN" : "GITHUB_TOKEN";
        details.push(`Resolved via $${resolvedVarName}`);
      }

      return {
        status: "pass",
        message: `GitHub token is available${sourceLabel}`,
        ...(details.length > 0 ? { details } : {}),
      };
    }

    return {
      status: "fail",
      message: "GitHub token not found",
      hint: "Run specrunner login to authenticate. Alternatively, set the GH_TOKEN env var or run 'gh auth login'.",
    };
  },
};
