/**
 * Check that the Anthropic API key is present (from credentials.json or env var).
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const managedKeyPresentCheck: DoctorCheck = {
  name: "managed/api-key-present",
  category: "config",
  required: true,

  async check(ctx: DoctorContext) {
    if (ctx.resolvedSpecRunnerApiKey !== null) {
      return {
        status: "pass",
        message: `Anthropic API key found (source: ${ctx.specRunnerApiKeySource})`,
      };
    }

    return {
      status: "fail",
      message: "Anthropic API key not found",
      hint: "Save an API key via 'specrunner login --provider anthropic', set SPECRUNNER_API_KEY env var, or add it to credentials.json.",
    };
  },
};
