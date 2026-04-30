/**
 * TC-035, TC-036
 * Check that environment.id is registered in config.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const environmentRegisteredCheck: DoctorCheck = {
  name: "environment-registered",
  category: "agents",
  required: true,

  async check(ctx: DoctorContext) {
    const envId = ctx.config.get("environment.id");

    if (typeof envId === "string" && envId.length > 0) {
      return {
        status: "pass",
        message: `Environment registered: ${envId}`,
      };
    }

    return {
      status: "fail",
      message: "No Anthropic environment registered in config",
      hint: "Run 'specrunner init' to create and register the environment.",
    };
  },
};
