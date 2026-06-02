/**
 * TC-027, TC-028, TC-063
 * Check that the git remote "origin" points to the configured GitHub host.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubOriginCheck: DoctorCheck = {
  name: "github-origin",
  category: "repo",
  required: true,

  async check(ctx: DoctorContext) {
    const configuredHost = (ctx.config.get("github.host") as string | undefined) ?? "github.com";

    try {
      const result = await ctx.execFile("git", ["remote", "get-url", "origin"], { signal: AbortSignal.timeout(5000) });
      const url = result.stdout.trim();

      if (url.includes(configuredHost)) {
        return {
          status: "pass",
          message: `origin points to ${configuredHost}: ${url}`,
        };
      }

      return {
        status: "fail",
        message: `origin does not point to ${configuredHost}: ${url}`,
        hint: `Set the remote 'origin' to a ${configuredHost} repository URL.`,
      };
    } catch {
      return {
        status: "fail",
        message: "No remote 'origin' found",
        hint: `Add a ${configuredHost} remote: git remote add origin https://${configuredHost}/owner/repo.git`,
      };
    }
  },
};
