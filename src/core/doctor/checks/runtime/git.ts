/**
 * TC-005, TC-006
 * Check that git is installed and available.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const gitVersionCheck: DoctorCheck = {
  name: "git-version",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      const result = await ctx.execFile("git", ["--version"], { signal: AbortSignal.timeout(5000) });
      const version = result.stdout.trim();
      return {
        status: "pass",
        message: version,
      };
    } catch {
      return {
        status: "fail",
        message: "git is not installed or not in PATH",
        hint: "Install git: https://git-scm.com/downloads",
      };
    }
  },
};
