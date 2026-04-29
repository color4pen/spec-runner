import type { SpecRunnerConfig } from "./schema.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

export type AgentRole = "propose" | "specFixer" | "specReview";

/**
 * Resolve an agent ID for a given role.
 *
 * Fallback chain:
 * 1. config.agents[role].id — new format, role-specific
 * 2. config.agent.id — legacy format, propose role only
 * 3. Throws CONFIG_INCOMPLETE if not found
 *
 * spec-fixer and specReview roles do NOT fall back to legacy config.agent.id.
 */
export function getAgentId(cfg: SpecRunnerConfig, role: AgentRole): string {
  // Try new format first
  const roleConfig = cfg.agents?.[role];
  if (roleConfig?.id) {
    return roleConfig.id;
  }

  // Legacy fallback — propose only
  if (role === "propose" && cfg.agent?.id) {
    return cfg.agent.id;
  }

  // Not found
  throw new SpecRunnerError(
    ERROR_CODES.CONFIG_INCOMPLETE,
    "Run 'specrunner init' to create role-specific agents.",
    `Missing agent ID for role: ${role}.`,
  );
}

/**
 * Get the default pipeline.maxRetries value.
 * Returns the configured value or the default of 2.
 */
export function getMaxRetries(cfg: SpecRunnerConfig): number {
  return cfg.pipeline?.maxRetries ?? 2;
}
