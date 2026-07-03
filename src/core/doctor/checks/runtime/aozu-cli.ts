/**
 * Check that the aozu CLI binary is available when design-layer integration is enabled.
 * Skipped (status: pass) when designLayer.enabled is not true.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const aozuCliCheck: DoctorCheck = {
  name: "aozu-cli",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    const enabled = ctx.config.get("designLayer.enabled");
    if (enabled !== true) {
      return {
        status: "pass",
        message: "aozu CLI not required (design layer integration disabled)",
      };
    }

    const command = (ctx.config.get("designLayer.command") as string | undefined) ?? "aozu";

    try {
      await ctx.execFile(command, ["--version"], {
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: "pass",
        message: `${command} CLI is available`,
      };
    } catch {
      return {
        status: "fail",
        message: `${command} CLI is not installed or not in PATH`,
        hint: `${command} を PATH に導入するか designLayer.command を修正してください`,
      };
    }
  },
};
