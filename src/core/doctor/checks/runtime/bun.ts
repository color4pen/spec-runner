/**
 * TC-003, TC-004
 * Check that bun is installed and available.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const bunVersionCheck: DoctorCheck = {
  name: "bun-version",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    try {
      const result = await ctx.execFile("bun", ["--version"], { signal: AbortSignal.timeout(5000) });
      const version = result.stdout.trim();
      return {
        status: "pass",
        message: `bun ${version}`,
      };
    } catch {
      return {
        status: "fail",
        message: "bun is not installed or not in PATH",
        hint: "Install bun: https://bun.sh/docs/installation",
      };
    }
  },
};
