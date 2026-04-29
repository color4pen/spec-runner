/**
 * Config schema and validator for specrunner CLI.
 * Uses hand-written validators (no zod) per design.md.
 */

export interface AnthropicConfig {
  apiKey: string;
}

export interface AgentConfig {
  id: string;
  definitionHash: string;
  lastSyncedAt: string;
}

export interface EnvironmentConfig {
  id: string;
  lastSyncedAt: string;
}

export interface GithubConfig {
  accessToken: string;
  tokenObtainedAt: string;
  scopes: string[];
}

export interface SpecReviewConfig {
  /** Polling interval in milliseconds. Default: 10000 (10s) */
  pollIntervalMs?: number;
  /** Total timeout in milliseconds. Default: 600000 (10m) */
  timeoutMs?: number;
}

export interface SpecFixerConfig {
  /** Total timeout in milliseconds. Default: 600000 (10m) */
  timeoutMs?: number;
}

/** Role-specific agent configuration entry */
export interface RoleAgentConfig {
  id: string;
  definitionHash: string;
  lastSyncedAt: string;
}

/** Per-role agent configuration (agents.{propose, specFixer, specReview}) */
export interface AgentsConfig {
  propose?: RoleAgentConfig;
  specFixer?: RoleAgentConfig;
  specReview?: RoleAgentConfig;
}

/** Pipeline-level settings */
export interface PipelineConfig {
  /**
   * Maximum number of spec-review iterations (body execution count).
   * Default: 2. Valid range: 1-10.
   */
  maxRetries?: number;
}

export interface SpecRunnerConfig {
  version: 1;
  anthropic: AnthropicConfig;
  /**
   * @deprecated Use `agents.propose` instead.
   * Kept for backward compatibility with existing configs.
   * Will be removed in a future clean-up request.
   */
  agent?: AgentConfig;
  agents?: AgentsConfig;
  pipeline?: PipelineConfig;
  environment?: EnvironmentConfig;
  github?: GithubConfig;
  specReview?: SpecReviewConfig;
  specFixer?: SpecFixerConfig;
}

export interface PartialSpecRunnerConfig {
  version?: number;
  anthropic?: Partial<AnthropicConfig>;
  agent?: Partial<AgentConfig>;
  agents?: Partial<AgentsConfig>;
  pipeline?: Partial<PipelineConfig>;
  environment?: Partial<EnvironmentConfig>;
  github?: Partial<GithubConfig>;
}

/**
 * Validate that the raw parsed config contains required fields.
 * Returns typed config or throws describing the missing field.
 * Throws CONFIG_INVALID if pipeline.maxRetries is out of range (1-10).
 */
export function validateConfig(raw: unknown): SpecRunnerConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  if (obj["version"] !== 1) {
    throw new Error("Config version must be 1.");
  }

  if (typeof obj["anthropic"] !== "object" || obj["anthropic"] === null) {
    throw new Error("Missing required config field: anthropic.apiKey.");
  }
  const anthropic = obj["anthropic"] as Record<string, unknown>;
  if (typeof anthropic["apiKey"] !== "string" || anthropic["apiKey"].length === 0) {
    throw new Error("Missing required config field: anthropic.apiKey.");
  }

  // Validate pipeline.maxRetries if provided
  if (obj["pipeline"] !== undefined && obj["pipeline"] !== null) {
    const pipeline = obj["pipeline"] as Record<string, unknown>;
    if (pipeline["maxRetries"] !== undefined) {
      const maxRetries = pipeline["maxRetries"];
      if (typeof maxRetries !== "number" || !Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
        throw new Error("CONFIG_INVALID: pipeline.maxRetries must be between 1 and 10.");
      }
    }
  }

  return raw as SpecRunnerConfig;
}

/**
 * Check if config has all fields needed to run the pipeline.
 * Returns error message or null if complete.
 */
export function checkConfigComplete(
  cfg: SpecRunnerConfig,
): { field: string; hint: string } | null {
  if (!cfg.anthropic?.apiKey) {
    return { field: "anthropic.apiKey", hint: "Run 'specrunner init' first." };
  }
  if (!cfg.agent?.id) {
    return { field: "agent.id", hint: "Run 'specrunner init' first." };
  }
  if (!cfg.environment?.id) {
    return { field: "environment.id", hint: "Run 'specrunner init' first." };
  }
  if (!cfg.github?.accessToken) {
    return { field: "github.accessToken", hint: "Run 'specrunner login' first." };
  }
  return null;
}
