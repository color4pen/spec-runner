/**
 * Check that SPECRUNNER_API_KEY env var is present (managed runtime API key).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const anthropicKeyPresentCheck: DoctorCheck = {
  name: "managed/api-key-present",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    const apiKey = ctx.env["SPECRUNNER_API_KEY"];

    if (typeof apiKey === "string" && apiKey.length > 0) {
      return {
        status: "pass",
        message: "SPECRUNNER_API_KEY env var is set",
      };
    }

    return {
      status: "fail",
      message: "SPECRUNNER_API_KEY env var is not set",
      hint: "Set SPECRUNNER_API_KEY env var and run 'specrunner managed setup'.",
    };
  },
};
