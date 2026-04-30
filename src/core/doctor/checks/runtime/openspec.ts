/**
 * TC-007, TC-008
 * Check that openspec is available via npx.
 * Uses 30s timeout because initial npm download can be slow.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

const OPENSPEC_TIMEOUT_MS = 30000;

export const openspecCheck: DoctorCheck = {
  name: "openspec-available",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENSPEC_TIMEOUT_MS);

    try {
      const result = await ctx.execFile(
        "npx",
        ["openspec", "--version"],
        { signal: controller.signal },
      );
      clearTimeout(timer);
      const version = result.stdout.trim();
      return {
        status: "pass",
        message: `openspec ${version} (via npx)`,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort =
        (err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"))) ||
        (err instanceof Error && err.message.includes("ETIMEDOUT"));
      if (isAbort) {
        return {
          status: "warn",
          message: "openspec check timed out after 30s",
          hint: "Check network connectivity or install openspec globally: npm install -g @fission-ai/openspec",
        };
      }
      return {
        status: "fail",
        message: "openspec is not available via npx",
        hint: "Install openspec: npm install -g @fission-ai/openspec",
      };
    }
  },
};
