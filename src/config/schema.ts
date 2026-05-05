/**
 * Config schema and validator for specrunner CLI.
 * Uses hand-written validators (no zod) per design.md.
 *
 * Design D4: agents is Record<StepName, AgentRecord> — the single canonical map.
 * Legacy `agent` (singular) and intermediate `agents.{propose,specFixer,specReview}` shapes
 * are handled by migrate.ts at load time.
 */
import type { StepName } from "../state/schema.js";

export interface AnthropicConfig {
  apiKey: string;
}

/**
 * Per-role agent record stored in config.
 * Note: field is `agentId` (not `id`) in the new canonical schema.
 */
export interface AgentRecord {
  agentId: string;
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
}

export type SpecFixerConfig = Record<string, never>;

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
  /**
   * Agent execution runtime.
   * - "managed": Anthropic Managed Agents via SessionClient (default)
   * - "local":   Claude Code SDK via subprocess invocation (no API key required)
   *
   * D7 (design.md): runtime field added to config. Default "managed" for backward compat.
   */
  runtime?: "managed" | "local";
  /**
   * Anthropic API config. Required for "managed" runtime.
   * For "local" runtime, may be absent or contain an empty apiKey.
   */
  anthropic: AnthropicConfig;
  /**
   * Canonical per-role agent map.
   * Keys are StepNames (kebab-case: "propose", "spec-review", "spec-fixer").
   * Populated by ConfigStore.load() after migration.
   */
  agents: Record<string, AgentRecord>;
  pipeline?: PipelineConfig;
  environment?: EnvironmentConfig;
  github?: GithubConfig;
  specReview?: SpecReviewConfig;
  specFixer?: SpecFixerConfig;
}

/**
 * Raw config as it may appear on disk — may contain legacy/intermediate fields.
 * Used only for reading and migration; never written back.
 */
export interface RawConfig {
  version?: number;
  /** See SpecRunnerConfig.runtime */
  runtime?: string; // may be any string — validated in validateConfig
  anthropic?: Partial<AnthropicConfig>;
  /** @deprecated Legacy single-agent format. Migrated to agents.propose at load time. */
  agent?: {
    id?: string;
    definitionHash?: string;
    lastSyncedAt?: string;
  };
  /**
   * May be either old intermediate shape (camelCase keys) or new canonical shape (kebab-case).
   * Normalized by migrate().
   */
  agents?: Record<string, unknown>;
  pipeline?: Partial<PipelineConfig>;
  environment?: Partial<EnvironmentConfig>;
  github?: Partial<GithubConfig>;
  specReview?: Partial<SpecReviewConfig>;
  specFixer?: Partial<SpecFixerConfig>;
}

/**
 * Validate that the raw parsed config contains required fields.
 * Called AFTER migration — expects new canonical schema.
 * Returns typed config or throws describing the missing field.
 * Throws CONFIG_INVALID if pipeline.maxRetries is out of range (1-10).
 * Throws CONFIG_INVALID if runtime is not "managed" or "local".
 *
 * D7 (design.md): runtime === "local" skips apiKey validation.
 */
export function validateConfig(raw: unknown): SpecRunnerConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  if (obj["version"] !== 1) {
    throw new Error("Config version must be 1.");
  }

  // TC-034: reject invalid runtime values
  const runtime = obj["runtime"];
  if (runtime !== undefined && runtime !== "managed" && runtime !== "local") {
    throw Object.assign(
      new Error('CONFIG_INVALID: runtime must be "managed" or "local".'),
      { code: "CONFIG_INVALID" },
    );
  }

  const isLocalRuntime = runtime === "local";

  // TC-033: local runtime skips apiKey requirement
  if (!isLocalRuntime) {
    if (typeof obj["anthropic"] !== "object" || obj["anthropic"] === null) {
      throw new Error("Missing required config field: anthropic.apiKey.");
    }
    const anthropic = obj["anthropic"] as Record<string, unknown>;
    if (typeof anthropic["apiKey"] !== "string" || anthropic["apiKey"].length === 0) {
      throw new Error("Missing required config field: anthropic.apiKey.");
    }
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
 *
 * D7 (design.md): local runtime skips apiKey/agents/environment checks.
 * TC-033: CONFIG_INCOMPLETE not raised for local runtime with missing apiKey.
 * TC-052: local runtime allows missing spec-review agent ID.
 */
export function checkConfigComplete(
  cfg: SpecRunnerConfig,
): { field: string; hint: string } | null {
  const isLocal = cfg.runtime === "local";

  if (!isLocal) {
    // managed mode: require apiKey, agents, and environment
    if (!cfg.anthropic?.apiKey) {
      return { field: "anthropic.apiKey", hint: "Run 'specrunner init' first." };
    }
    if (!cfg.agents?.["propose"]?.agentId) {
      return { field: "agents.propose.agentId", hint: "Run 'specrunner init' first." };
    }
    if (!cfg.environment?.id) {
      return { field: "environment.id", hint: "Run 'specrunner init' first." };
    }
  }

  // Both runtimes require GitHub token for PR creation (TC-041: local still requires login)
  if (!cfg.github?.accessToken) {
    return { field: "github.accessToken", hint: "Run 'specrunner login' first." };
  }
  return null;
}

