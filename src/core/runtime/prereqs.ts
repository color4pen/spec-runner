/**
 * Runtime-specific prerequisite checks and credential resolution.
 *
 * Extracted from preflight.ts to confine config.runtime branching to the
 * core/runtime/ composition-root (B-8 invariant).
 */
import { resolveSpecRunnerApiKey } from "../credentials/anthropic.js";
import { requirementsFor } from "../credentials/requirements.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

// ---------------------------------------------------------------------------
// checkRuntimePrereqs
// ---------------------------------------------------------------------------

/**
 * Check runtime-specific prerequisites using declarative requirements matrix.
 * Returns { field, hint } when a prerequisite is missing, null when all are satisfied.
 * For non-managed runtimes, only checks non-anthropic requirements.
 */
export async function checkRuntimePrereqs(
  cfg: SpecRunnerConfig,
  env: Record<string, string | undefined>,
): Promise<{ field: string; hint: string } | null> {
  const requirements = requirementsFor(cfg.runtime ?? "local");

  for (const req of requirements) {
    if (req.key === "anthropic.apiKey") {
      try {
        await resolveSpecRunnerApiKey(env);
      } catch {
        return {
          field: req.envVar,
          hint: "Save an API key via 'specrunner login --provider anthropic', set SPECRUNNER_API_KEY env var, then run 'specrunner managed setup'.",
        };
      }
    }
  }

  // Check non-credential runtime requirements (agents config, environment config)
  if (cfg.runtime === "managed") {
    if (!cfg.agents?.["design"]?.agentId) {
      return {
        field: "agents.design.agentId",
        hint: "Run 'specrunner managed setup' first.",
      };
    }
    if (!cfg.environment?.id) {
      return {
        field: "environment.id",
        hint: "Run 'specrunner managed setup' first.",
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// resolveRuntimeCredentials
// ---------------------------------------------------------------------------

export interface RuntimeCredentials {
  specRunnerApiKey?: string;
  specRunnerApiKeySource?: "credentials" | "env";
}

/**
 * Resolve runtime-specific credentials.
 * - managed: resolves the Anthropic API key (best-effort; checkRuntimePrereqs already validated)
 * - local / other: returns empty (no additional credentials needed)
 */
export async function resolveRuntimeCredentials(
  config: SpecRunnerConfig,
  env: Record<string, string | undefined>,
): Promise<RuntimeCredentials> {
  if (config.runtime !== "managed") {
    return {};
  }

  try {
    const resolved = await resolveSpecRunnerApiKey(env, { optional: true });
    if (resolved) {
      return {
        specRunnerApiKey: resolved.apiKey,
        specRunnerApiKeySource: resolved.source,
      };
    }
  } catch {
    // Already validated in checkRuntimePrereqs; ignore
  }

  return {};
}
