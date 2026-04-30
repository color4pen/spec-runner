/**
 * TC-012, TC-013
 * Check that anthropic.apiKey is present in the config.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const anthropicKeyPresentCheck: DoctorCheck = {
  name: "anthropic-key-present",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    const apiKey = ctx.config.get("anthropic.apiKey");

    if (typeof apiKey === "string" && apiKey.length > 0) {
      return {
        status: "pass",
        message: "anthropic.apiKey is set in config",
      };
    }

    return {
      status: "fail",
      message: "anthropic.apiKey is not set in config",
      hint: "Run 'specrunner init --api-key=<KEY>' to configure your Anthropic API key.",
    };
  },
};
