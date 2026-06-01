/**
 * Port interfaces for runtime-specific prerequisite checking and credential resolution.
 *
 * Defined in core/port/ so domain layers can reference these types without
 * importing from the composition-root (core/runtime/).
 *
 * Implementations live in core/runtime/prereqs.ts (B-8 invariant: config.runtime
 * branching stays in core/runtime/).
 */
import type { SpecRunnerConfig } from "../../config/schema.js";

export interface RuntimeCredentials {
  specRunnerApiKey?: string;
  specRunnerApiKeySource?: "credentials" | "env";
}

export interface RuntimePrereqChecker {
  check(
    cfg: SpecRunnerConfig,
    env: Record<string, string | undefined>,
  ): Promise<{ field: string; hint: string } | null>;
}

export interface RuntimeCredentialsResolver {
  resolve(
    cfg: SpecRunnerConfig,
    env: Record<string, string | undefined>,
  ): Promise<RuntimeCredentials>;
}
