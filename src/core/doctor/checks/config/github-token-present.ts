/**
 * TC-014, TC-015
 * Check that github.accessToken is present in the config.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubTokenPresentCheck: DoctorCheck = {
  name: "github-token-present",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    const token = ctx.config.get("github.accessToken");

    if (typeof token === "string" && token.length > 0) {
      return {
        status: "pass",
        message: "github.accessToken is set in config",
      };
    }

    return {
      status: "fail",
      message: "github.accessToken is not set in config",
      hint: "Run 'specrunner login' to authenticate with GitHub.",
    };
  },
};
