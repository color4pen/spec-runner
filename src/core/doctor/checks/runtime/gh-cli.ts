/**
 * Check that the gh CLI is installed and available in PATH.
 * Required for PR creation, merge, and listing operations.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const ghCliPresentCheck: DoctorCheck = {
  name: "gh-cli-present",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      const result = await ctx.execFile("gh", ["--version"], { signal: AbortSignal.timeout(5000) });
      const version = result.stdout.trim().split("\n")[0] ?? result.stdout.trim();
      return {
        status: "pass",
        message: version || "gh CLI is available",
      };
    } catch {
      return {
        status: "fail",
        message: "gh CLI is not installed or not in PATH",
        hint: "Install gh CLI: https://cli.github.com/",
      };
    }
  },
};
