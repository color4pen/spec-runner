/**
 * T-12: Generic git origin check for GitHub-disabled jobs.
 *
 * Checks that the git remote "origin" is configured (any URL, not GitHub-specific).
 * Run instead of github-origin when GitHub integration is disabled.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const gitOriginCheck: DoctorCheck = {
  name: "git-origin",
  category: "repo",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      const result = await ctx.execFile("git", ["remote", "get-url", "origin"], { signal: AbortSignal.timeout(5000) });
      const url = result.stdout.trim();

      if (!url) {
        return {
          status: "fail",
          message: "Remote 'origin' URL is empty",
          hint: "Add a remote: git remote add origin <url>",
        };
      }

      return {
        status: "pass",
        message: `origin is configured: ${url}`,
      };
    } catch {
      return {
        status: "fail",
        message: "No remote 'origin' found",
        hint: "Add a remote: git remote add origin <url>",
      };
    }
  },
};
