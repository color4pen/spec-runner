/**
 * Config schema and validator for specrunner CLI.
 * Uses hand-written validators (no zod) per design.md.
 *
 * Design D4: agents is Record<StepName, AgentRecord> — the single canonical map.
 * Legacy `agent` (singular) and intermediate `agents.{propose,specFixer,specReview}` shapes
 * are handled by migrate.ts at load time.
 */
import type { StepName } from "../state/schema.js";

/**
 * Per-step execution config: model, maxTurns, timeoutMs.
 * All fields are optional — missing fields fall back to the next priority level.
 *
 * maxTurns: null = unlimited (do not pass maxTurns to SDK)
 * maxTurns: undefined = not set at this priority level, fall back to next
 * timeoutMs: null = no timeout
 */
export interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;
  timeoutMs?: number | null;
}

/**
 * Map of step names to per-step execution config.
 * `defaults` applies to all steps not explicitly overridden.
 * Other keys are step names (kebab-case: "implementer", "spec-review", etc.)
 *
 * D1 (design.md): Record-based to avoid type changes when new steps are added.
 */
export interface StepConfigMap {
  defaults?: StepExecutionConfig;
  [stepName: string]: StepExecutionConfig | undefined;
}

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
  /**
   * Per-step execution config: model, maxTurns, timeoutMs.
   * Effective only for local runtime (ClaudeCodeRunner).
   * ManagedAgentRunner ignores this field.
   *
   * D1 (design.md): steps is optional for backward compatibility.
   * Steps section absent = use step definition hardcoded values.
   */
  steps?: StepConfigMap;
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
  /** Per-step execution config — passed through as-is. Validated in validateConfig(). */
  steps?: Record<string, unknown>;
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

  // Validate steps section if provided
  // TC-013/TC-014/TC-015/TC-016: validate maxTurns (number>=1 | null), model (non-empty string), timeoutMs (number>=1 | null)
  if (obj["steps"] !== undefined && obj["steps"] !== null) {
    if (typeof obj["steps"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: steps must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const stepsObj = obj["steps"] as Record<string, unknown>;
    for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
      if (stepVal === undefined || stepVal === null) continue;
      if (typeof stepVal !== "object") {
        throw Object.assign(
          new Error(`CONFIG_INVALID: steps.${stepKey} must be an object.`),
          { code: "CONFIG_INVALID" },
        );
      }
      const stepCfg = stepVal as Record<string, unknown>;

      // Validate maxTurns: must be number >= 1 or null (not 0, not negative, not string)
      if (stepCfg["maxTurns"] !== undefined) {
        const maxTurns = stepCfg["maxTurns"];
        if (maxTurns !== null) {
          if (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.maxTurns must be a positive integer or null.`),
              { code: "CONFIG_INVALID" },
            );
          }
        }
      }

      // Validate model: must be non-empty string if provided
      if (stepCfg["model"] !== undefined) {
        const model = stepCfg["model"];
        if (typeof model !== "string" || model.length === 0) {
          throw Object.assign(
            new Error(`CONFIG_INVALID: steps.${stepKey}.model must be a non-empty string.`),
            { code: "CONFIG_INVALID" },
          );
        }
      }

      // Validate timeoutMs: must be number >= 1 or null (not 0, not negative)
      if (stepCfg["timeoutMs"] !== undefined) {
        const timeoutMs = stepCfg["timeoutMs"];
        if (timeoutMs !== null) {
          if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.timeoutMs must be a positive integer or null.`),
              { code: "CONFIG_INVALID" },
            );
          }
        }
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

