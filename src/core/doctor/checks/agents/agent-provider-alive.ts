/**
 * TC-DR-006
 * Check that all registered agent IDs exist on the Anthropic provider side.
 * Heavy check: performs GET /v1/agents/{id}?beta=true per agent.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { STEP_NAMES } from "../../../step/step-names.js";

const ANTHROPIC_AGENTS_BASE = "https://api.anthropic.com/v1/agents";
const ANTHROPIC_API_TIMEOUT_MS = 5000;

const AGENT_ROLES = [
  STEP_NAMES.DESIGN,
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_REVIEW,
  STEP_NAMES.CODE_FIXER,
] as const;

export const agentProviderAliveCheck: DoctorCheck = {
  name: "managed/agent-provider-alive",
  category: "agents",
  required: true,

  async check(ctx: DoctorContext) {
    const apiKey = ctx.resolvedSpecRunnerApiKey;
    if (apiKey === null) {
      return {
        status: "warn",
        message: "Anthropic API key not available — skipping provider-side agent check",
        hint: "Save an API key via 'specrunner login --provider anthropic' or set SPECRUNNER_API_KEY env var.",
      };
    }

    const missing: string[] = [];
    const notFound: string[] = [];

    for (const role of AGENT_ROLES) {
      const agentId = ctx.config.get(`agents.${role}.agentId`);
      if (typeof agentId !== "string" || agentId.length === 0) {
        missing.push(role);
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ANTHROPIC_API_TIMEOUT_MS);
      try {
        const response = await ctx.fetch(
          `${ANTHROPIC_AGENTS_BASE}/${agentId}?beta=true`,
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

        if (response.status === 401) {
          return {
            status: "fail",
            message: "Anthropic API key is invalid or revoked (HTTP 401)",
            hint: "Check your SPECRUNNER_API_KEY value.",
          };
        }
        if (response.status === 404) {
          notFound.push(role);
        } else if (response.status !== 200) {
          return {
            status: "warn",
            message: `Anthropic API returned HTTP ${response.status} — cannot confirm agent existence`,
            hint: "Check connectivity and retry.",
          };
        }
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
    }

    if (missing.length > 0) {
      return {
        status: "fail",
        message: `Missing agent IDs in config: ${missing.join(", ")}`,
        hint: "Run 'specrunner managed setup' to register agents.",
      };
    }

    if (notFound.length > 0) {
      return {
        status: "fail",
        message: `Agents not found on provider side: ${notFound.join(", ")}`,
        hint: "Run 'specrunner managed setup' to reconcile agents.",
      };
    }

    return {
      status: "pass",
      message: `All ${AGENT_ROLES.length} agents exist on provider side`,
    };
  },
};
