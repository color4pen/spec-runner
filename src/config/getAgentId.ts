import type { SpecRunnerConfig } from "./schema.js";
import type { StepName } from "../state/schema.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

/**
 * Resolve an agent ID for a given role from the new canonical schema.
 *
 * Reads from `config.agents[role].agentId` only.
 * Legacy `config.agent.id` fallback has been removed (design.md D4).
 * Throws CONFIG_INCOMPLETE if the role's entry is missing.
 */
export function getAgentId(cfg: SpecRunnerConfig, role: StepName): string {
  const record = cfg.agents?.[role];
  if (record?.agentId) {
    return record.agentId;
  }

  throw new SpecRunnerError(
    ERROR_CODES.CONFIG_INCOMPLETE,
    `Run 'specrunner init' to create the ${role} agent.`,
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
