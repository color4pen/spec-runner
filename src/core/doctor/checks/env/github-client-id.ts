/**
 * TC-016, TC-017
 * Check SPECRUNNER_GITHUB_CLIENT_ID environment variable.
 * Missing = pass (built-in client_id is used as default).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const githubClientIdCheck: DoctorCheck = {
  name: "github-client-id",
  category: "env",
  required: false,

  async check(ctx: DoctorContext) {
    const clientId = ctx.env["SPECRUNNER_GITHUB_CLIENT_ID"];

    if (typeof clientId === "string" && clientId.length > 0) {
      return {
        status: "pass",
        message: "SPECRUNNER_GITHUB_CLIENT_ID is set",
      };
    }

    return {
      status: "pass",
      message: "SPECRUNNER_GITHUB_CLIENT_ID is not set (using built-in client_id)",
    };
  },
};
