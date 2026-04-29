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

export interface SpecRunnerConfig {
  version: 1;
  anthropic: AnthropicConfig;
  agent?: AgentConfig;
  environment?: EnvironmentConfig;
  github?: GithubConfig;
  specReview?: SpecReviewConfig;
}

export interface PartialSpecRunnerConfig {
  version?: number;
  anthropic?: Partial<AnthropicConfig>;
  agent?: Partial<AgentConfig>;
  environment?: Partial<EnvironmentConfig>;
  github?: Partial<GithubConfig>;
}

/**
 * Validate that the raw parsed config contains required fields.
 * Returns typed config or throws describing the missing field.
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
