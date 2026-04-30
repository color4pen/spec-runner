/**
 * TC-001, TC-002, TC-069, TC-070
 * Check that node version is >= 18.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const nodeVersionCheck: DoctorCheck = {
  name: "node-version",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    const rawVersion = ctx.processVersion ?? "v0.0.0";
    const match = /^v?(\d+)/.exec(rawVersion);
    const major = match?.[1] ? parseInt(match[1], 10) : 0;

    if (major >= 18) {
      return {
        status: "pass",
        message: `Node.js ${rawVersion} (>= 18 required)`,
      };
    }

    return {
      status: "fail",
      message: `Node.js ${rawVersion} is too old (>= 18 required)`,
      hint: "Upgrade Node.js: https://nodejs.org/en/download/",
    };
  },
};
