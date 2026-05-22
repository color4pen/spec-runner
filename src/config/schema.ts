/**
 * Config schema and validator for specrunner CLI.
 * Uses hand-written validators (no zod) per design.md.
 *
 * Design D4: agents is Record<StepName, AgentRecord> — the single canonical map.
 * Legacy `agent` (singular) and intermediate `agents.{propose,specFixer,specReview}` shapes
 * are handled by migrate.ts at load time.
 */
import { BUILTIN_MODEL_REGISTRY } from "./model-registry.js";
import type { AgentStepName } from "../state/schema.js";

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

export interface ModelEntry {
  provider: "anthropic" | "openai";
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
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

export interface SpecReviewConfig {
  /** Polling interval in milliseconds. Default: 10000 (10s) */
  pollIntervalMs?: number;
}

/** Progress display settings */
export interface ProgressConfig {
  /**
   * Heartbeat interval in seconds.
   * 0 or null disables the heartbeat entirely.
   * When absent, defaults to 30s (TTY) or 60s (non-TTY) at runtime.
   */
  heartbeatIntervalSec?: number | null;
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
   * - "managed": Anthropic Managed Agents via SessionClient
   * - "local":   Claude Code SDK via subprocess invocation (no API key required)
   *
   * D7 (design.md): runtime field added to config. Default "local".
   */
  runtime?: "managed" | "local";
  /**
   * Canonical per-role agent map.
   * Keys are AgentStepNames (kebab-case: "design", "spec-review", "spec-fixer").
   * Populated by ConfigStore.load() after migration.
   * Partial because not all agent steps may be configured (e.g. local runtime).
   */
  agents: Partial<Record<AgentStepName, AgentRecord>>;
  pipeline?: PipelineConfig;
  environment?: EnvironmentConfig;
  specReview?: SpecReviewConfig;
  specFixer?: SpecFixerConfig;
  /**
   * Per-step execution config: model, maxTurns, timeoutMs.
   * Effective for local runtime (ClaudeCodeRunner) and managed agent runtime (ManagedAgentRunner).
   * - ClaudeCodeRunner: AbortController + setTimeout
   * - ManagedAgentRunner: pollUntilComplete() の timeoutMs パラメータ経由
   * Default: null (unlimited) — timeout is only applied when explicitly configured.
   *
   * D1 (design.md): steps is optional for backward compatibility.
   * Steps section absent = use step definition hardcoded values.
   */
  steps?: StepConfigMap;
  /**
   * Progress display settings: heartbeat interval, TTY behaviour.
   * Absent → defaults applied at CLI composition point.
   */
  progress?: ProgressConfig;
  /**
   * User-defined model registry. Merged with BUILTIN_MODEL_REGISTRY at runtime.
   * Use this to add new models or override provider assignments.
   * When absent, only built-in models are available.
   * D5 (design.md): user entries override built-ins.
   */
  models?: ModelsConfig;
}

/**
 * Raw config as it may appear on disk — may contain legacy/intermediate fields.
 * Used only for reading and migration; never written back.
 */
export interface RawConfig {
  version?: number;
  /** See SpecRunnerConfig.runtime */
  runtime?: string; // may be any string — validated in validateConfig
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
  specReview?: Partial<SpecReviewConfig>;
  specFixer?: Partial<SpecFixerConfig>;
  /** Per-step execution config — passed through as-is. Validated in validateConfig(). */
  steps?: Record<string, unknown>;
  models?: Record<string, unknown>;
  progress?: Partial<Record<string, unknown>>;
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

      // Validate timeoutMs: must be number >= 0 or null (0 = disable timeout, negative = invalid)
      if (stepCfg["timeoutMs"] !== undefined) {
        const timeoutMs = stepCfg["timeoutMs"];
        if (timeoutMs !== null) {
          if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 0) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.timeoutMs must be a non-negative integer or null.`),
              { code: "CONFIG_INVALID" },
            );
          }
        }
      }
    }
  }

  // Validate models section if provided
  if (obj["models"] !== undefined && obj["models"] !== null) {
    if (typeof obj["models"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: models must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const modelsObj = obj["models"] as Record<string, unknown>;
    for (const [modelName, modelVal] of Object.entries(modelsObj)) {
      if (typeof modelVal !== "object" || modelVal === null) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: models.${modelName} must be an object.`),
          { code: "CONFIG_INVALID" },
        );
      }
      const entry = modelVal as Record<string, unknown>;
      if (entry["provider"] !== "anthropic" && entry["provider"] !== "openai") {
        throw Object.assign(
          new Error(`CONFIG_INVALID: models.${modelName}.provider must be "anthropic" or "openai".`),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }

  // Validate progress section if provided
  if (obj["progress"] !== undefined && obj["progress"] !== null) {
    if (typeof obj["progress"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: progress must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const progress = obj["progress"] as Record<string, unknown>;
    if (progress["heartbeatIntervalSec"] !== undefined) {
      const interval = progress["heartbeatIntervalSec"];
      if (interval !== null) {
        if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 0) {
          throw Object.assign(
            new Error("CONFIG_INVALID: progress.heartbeatIntervalSec must be a non-negative integer or null."),
            { code: "CONFIG_INVALID" },
          );
        }
      }
    }
  }

  // Validate that step models exist in the merged registry and that OpenAI models
  // are not used with managed runtime (D6 design.md).
  if (obj["steps"] !== undefined && obj["steps"] !== null) {
    const stepsObj = obj["steps"] as Record<string, unknown>;
    const userModels = (obj["models"] ?? {}) as Record<string, { provider?: string }>;
    const merged = { ...BUILTIN_MODEL_REGISTRY, ...userModels };
    const allModelNames = new Set(Object.keys(merged));
    const openaiModels = new Set(
      Object.entries(merged)
        .filter(([, v]) => (v as { provider?: string }).provider === "openai")
        .map(([k]) => k),
    );

    const collectStepModel = (stepKey: string, stepVal: unknown): string | undefined => {
      if (typeof stepVal === "object" && stepVal !== null) {
        const m = (stepVal as Record<string, unknown>)["model"];
        if (typeof m === "string" && m.length > 0) return m;
      }
      return undefined;
    };

    for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
      const model = collectStepModel(stepKey, stepVal);
      if (model === undefined) continue;

      // Guard: unknown model
      if (!allModelNames.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: steps.${stepKey}.model "${model}" is not in the model registry. Add it to config.models.`),
          { code: "CONFIG_INVALID" },
        );
      }

      // Guard: managed + openai
      const isManagedRuntime = runtime === "managed";
      if (isManagedRuntime && openaiModels.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: OpenAI model "${model}" cannot be used with runtime "managed".`),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }

  return raw as SpecRunnerConfig;
}

/**
 * Check if config has all fields needed to run the pipeline.
 * Returns error message or null if complete.
 *
 * Managed-runtime specific checks (apiKey, agents, environment) have moved to
 * `checkRuntimePrereqs` in preflight.ts to allow a cleaner separation.
 * TC-033: CONFIG_INCOMPLETE not raised for local runtime with missing apiKey.
 * TC-052: local runtime allows missing spec-review agent ID.
 */
export function checkConfigComplete(
  _cfg: SpecRunnerConfig,
): { field: string; hint: string } | null {
  // GitHub token check moved to runPreflight (resolveGitHubToken via credentials file / env var).
  // Config no longer stores secrets.
  return null;
}

