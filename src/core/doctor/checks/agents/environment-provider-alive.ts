/**
 * TC-DR-006
 * Check that the registered environment ID exists on the Anthropic provider side.
 * Heavy check: performs GET /v1/environments/{id}?beta=true.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

const ANTHROPIC_ENVIRONMENTS_BASE = "https://api.anthropic.com/v1/environments";
const ANTHROPIC_API_TIMEOUT_MS = 5000;

export const environmentProviderAliveCheck: DoctorCheck = {
  name: "managed/environment-provider-alive",
  category: "agents",
  required: true,

  async check(ctx: DoctorContext) {
    const apiKey = ctx.resolvedSpecRunnerApiKey;
    if (apiKey === null) {
      return {
        status: "warn",
        message: "Anthropic API key not available — skipping provider-side environment check",
        hint: "Save an API key via 'specrunner login --provider anthropic' or set SPECRUNNER_API_KEY env var.",
      };
    }

    const envId = ctx.config.get("environment.id");
    if (typeof envId !== "string" || envId.length === 0) {
      return {
        status: "fail",
        message: "No environment.id in config",
        hint: "Run 'specrunner managed setup'.",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANTHROPIC_API_TIMEOUT_MS);
    try {
      const response = await ctx.fetch(
        `${ANTHROPIC_ENVIRONMENTS_BASE}/${envId}?beta=true`,
        {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "managed-agents-2026-04-01",
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (response.status === 200) {
        return {
          status: "pass",
          message: `Environment ${envId} exists on provider side`,
        };
      }

      if (response.status === 401) {
        return {
          status: "fail",
          message: "Anthropic API key is invalid or revoked (HTTP 401)",
          hint: "Check your SPECRUNNER_API_KEY value.",
        };
      }

      if (response.status === 404) {
        return {
          status: "fail",
          message: `Environment ${envId} not found on provider side`,
          hint: "Run 'specrunner managed setup' to recreate the environment.",
        };
      }

      return {
        status: "warn",
        message: `Anthropic API returned HTTP ${response.status} — cannot confirm environment existence`,
        hint: "Check connectivity and retry.",
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message.includes("abort") ||
          err.message.includes("The operation was aborted"));
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
