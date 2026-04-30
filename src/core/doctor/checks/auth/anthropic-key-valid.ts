/**
 * TC-018, TC-019, TC-020, TC-021, TC-064
 * Validate Anthropic API key via GET /v1/models.
 * 200 = pass, 401 = fail, 5xx/timeout = warn.
 * Uses DoctorContext.fetch (not global fetch) — core never imports adapter.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

const ANTHROPIC_API_TIMEOUT_MS = 5000;
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";

export const anthropicKeyValidCheck: DoctorCheck = {
  name: "anthropic-key-valid",
  category: "auth",
  required: true,

  async check(ctx: DoctorContext) {
    const apiKey = ctx.config.get("anthropic.apiKey");
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return {
        status: "fail",
        message: "anthropic.apiKey is not configured — cannot validate",
        hint: "Run 'specrunner init --api-key=<KEY>' first.",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANTHROPIC_API_TIMEOUT_MS);

    try {
      const response = await ctx.fetch(ANTHROPIC_MODELS_URL, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 200) {
        return {
          status: "pass",
          message: "Anthropic API key is valid",
        };
      }

      if (response.status === 401) {
        return {
          status: "fail",
          message: "Anthropic API key is invalid or revoked (HTTP 401)",
          hint: "Run 'specrunner init --api-key=<KEY>' with a valid API key.",
        };
      }

      // 5xx or other
      return {
        status: "warn",
        message: `Anthropic API returned HTTP ${response.status} — cannot confirm key validity`,
        hint: "Check connectivity and retry.",
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort") || err.message.includes("The operation was aborted"));
      if (isAbort) {
        return {
          status: "warn",
          message: "network timeout contacting Anthropic API (5s)",
          hint: "Check connectivity and retry.",
        };
      }
      return {
        status: "warn",
        message: `Cannot reach Anthropic API: ${(err as Error).message}`,
        hint: "Check connectivity and retry.",
      };
    }
  },
};
