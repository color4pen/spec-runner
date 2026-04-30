/**
 * TC-027, TC-028, TC-063
 * Check that the git remote "origin" points to GitHub.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubOriginCheck: DoctorCheck = {
  name: "github-origin",
  category: "repo",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      const result = await ctx.execFile("git", ["remote", "get-url", "origin"], { signal: AbortSignal.timeout(5000) });
      const url = result.stdout.trim();

      if (url.includes("github.com")) {
        return {
          status: "pass",
          message: `origin points to GitHub: ${url}`,
        };
      }

      return {
        status: "fail",
        message: `origin does not point to GitHub: ${url}`,
        hint: "Set the remote 'origin' to a GitHub repository URL.",
      };
    } catch {
      return {
        status: "fail",
        message: "No remote 'origin' found",
        hint: "Add a GitHub remote: git remote add origin https://github.com/owner/repo.git",
      };
    }
  },
};
