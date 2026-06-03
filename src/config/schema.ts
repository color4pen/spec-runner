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
import { stderrWrite } from "../logger/stdout.js";

/**
 * Per-step execution config: model, maxTurns, timeoutMs.
 * All fields are optional — missing fields fall back to the next priority level.
 *
 * maxTurns: null = unlimited (do not pass maxTurns to SDK)
 * maxTurns: undefined = not set at this priority level, fall back to next
 * timeoutMs: null = no timeout
 *
 * byRequestType: per-request-type model override. Keys are request type names
 * (e.g. "bug-fix", "spec-change", "new-feature"). Values are StepExecutionConfig
 * objects — 1 level deep only, nested byRequestType is prohibited (CONFIG_INVALID).
 * When requestType matches a key, the corresponding config takes highest priority
 * over the step-level config.
 */
export interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;
  timeoutMs?: number | null;
  byRequestType?: Record<string, StepExecutionConfig>;
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

/**
 * A single verification command entry.
 * Can be a plain string (shorthand) or an object with optional name and required run.
 *
 * - string: `"ruff check"` → executed as `sh -c "ruff check"`
 * - object with name: `{ name: "lint", run: "eslint ./src" }` → label displayed on failure
 * - object without name: `{ run: "pytest" }` → command string displayed on failure
 */
export type VerificationCommand = string | { name?: string; run: string };

/**
 * Verification step configuration.
 * When commands is defined, runVerification() executes them in order (fail-fast).
 * When commands is undefined, the existing phase-detection fallback is used.
 */
export interface VerificationConfig {
  /**
   * Ordered list of commands to execute during verification.
   * Each command is executed via `sh -c <command>` (POSIX shell, Windows not supported).
   * fail-fast: first non-zero exit code stops the sequence; remaining entries are skipped.
   * When absent, falls back to package.json script detection (build/typecheck/test/lint/security).
   */
  commands?: VerificationCommand[];
}

/** Pipeline-level settings */
export interface PipelineConfig {
  /**
   * Maximum number of spec-review iterations (body execution count).
   * Default: 2. Valid range: 1-10.
   */
  maxRetries?: number;
}

/**
 * Log retention settings.
 * Controls how many job logs are retained in .specrunner/logs/.
 */
export interface LogsConfig {
  /**
   * Maximum number of job log entries to retain.
   * Oldest logs are deleted when this limit is exceeded.
   * Valid range: 1-1000. Default: 20.
   */
  maxJobs?: number;
}

/**
 * Default wait timeout for --with-merge (10 minutes).
 * Covers most typical CI pipelines. Set archive.mergeWaitTimeoutMs: null for unlimited.
 */
export const DEFAULT_MERGE_WAIT_TIMEOUT_MS = 600_000;

/**
 * Default poll interval for --with-merge check status polling (15 seconds).
 */
export const DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS = 15_000;

/**
 * Archive-specific configuration.
 * Controls --with-merge wait behaviour.
 */
export interface ArchiveConfig {
  /**
   * Maximum time in milliseconds to wait for PR checks to become green before giving up.
   * null = wait indefinitely (no timeout) — aligns with maxTurns: null convention.
   * undefined / absent = use DEFAULT_MERGE_WAIT_TIMEOUT_MS (600_000 ms = 10 minutes).
   * 0 = no wait (attempt merge immediately after first check-status poll).
   */
  mergeWaitTimeoutMs?: number | null;
  /**
   * Interval in milliseconds between check-status polls while waiting for green.
   * undefined / absent = use DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS (15_000 ms = 15 seconds).
   */
  mergeWaitPollIntervalMs?: number;
}

/** GitHub host and API base URL configuration. */
export interface GitHubHostConfig {
  /** GitHub host (e.g. "github.com" or "ghes.corp.example.com"). Default: "github.com". */
  host?: string;
  /** Override API base URL (e.g. "https://ghes.corp.example.com/api/v3"). Derived from host when absent. */
  apiBaseUrl?: string;
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
  /**
   * Verification step configuration.
   * When verification.commands is defined, runVerification() executes them in order (fail-fast).
   * When absent, the existing phase-detection fallback is used (package.json scripts).
   */
  verification?: VerificationConfig;
  /**
   * Log retention settings.
   * Controls how many job logs are kept in .specrunner/logs/.
   * When absent, defaults to 20 jobs retained.
   */
  logs?: LogsConfig;
  /**
   * GitHub host configuration.
   * When absent, defaults to github.com / api.github.com (public GitHub).
   */
  github?: GitHubHostConfig;
  /**
   * Archive command configuration.
   * Controls --with-merge wait behaviour (timeout, poll interval).
   */
  archive?: ArchiveConfig;
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
  /** Verification configuration — passed through as-is. Validated in validateConfig(). */
  verification?: unknown;
  /** GitHub host configuration — passed through as-is. Validated in validateConfig(). */
  github?: Partial<Record<string, unknown>>;
  /** Archive configuration — passed through as-is. Validated in validateConfig(). */
  archive?: Partial<Record<string, unknown>>;
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

      // Validate byRequestType: object, non-empty string keys, valid StepExecutionConfig values (no nested byRequestType)
      if (stepCfg["byRequestType"] !== undefined) {
        const byRT = stepCfg["byRequestType"];
        if (typeof byRT !== "object" || byRT === null) {
          throw Object.assign(
            new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType must be an object.`),
            { code: "CONFIG_INVALID" },
          );
        }
        const knownTypes = new Set(["bug-fix", "spec-change", "new-feature", "refactoring", "chore"]);
        for (const [typeKey, typeVal] of Object.entries(byRT as Record<string, unknown>)) {
          // Empty string key → CONFIG_INVALID
          if (typeKey.length === 0) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType contains an empty string key.`),
              { code: "CONFIG_INVALID" },
            );
          }
          // Unknown type key → warning only
          if (!knownTypes.has(typeKey)) {
            stderrWrite(
              `[specrunner] warn: steps.${stepKey}.byRequestType.${typeKey} is not a known request type. Known types: ${[...knownTypes].join(", ")}.`,
            );
          }
          if (typeVal === undefined || typeVal === null) continue;
          if (typeof typeVal !== "object") {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey} must be an object.`),
              { code: "CONFIG_INVALID" },
            );
          }
          const typeCfg = typeVal as Record<string, unknown>;

          // Nested byRequestType → CONFIG_INVALID (1-level limit)
          if (typeCfg["byRequestType"] !== undefined) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey}.byRequestType is not allowed (1-level limit).`),
              { code: "CONFIG_INVALID" },
            );
          }

          // Validate maxTurns inside byRequestType entry
          if (typeCfg["maxTurns"] !== undefined) {
            const maxTurns = typeCfg["maxTurns"];
            if (maxTurns !== null) {
              if (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1) {
                throw Object.assign(
                  new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey}.maxTurns must be a positive integer or null.`),
                  { code: "CONFIG_INVALID" },
                );
              }
            }
          }

          // Validate model inside byRequestType entry
          if (typeCfg["model"] !== undefined) {
            const model = typeCfg["model"];
            if (typeof model !== "string" || model.length === 0) {
              throw Object.assign(
                new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey}.model must be a non-empty string.`),
                { code: "CONFIG_INVALID" },
              );
            }
          }

          // Validate timeoutMs inside byRequestType entry
          if (typeCfg["timeoutMs"] !== undefined) {
            const timeoutMs = typeCfg["timeoutMs"];
            if (timeoutMs !== null) {
              if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 0) {
                throw Object.assign(
                  new Error(`CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey}.timeoutMs must be a non-negative integer or null.`),
                  { code: "CONFIG_INVALID" },
                );
              }
            }
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

  // Validate verification section if provided
  if (obj["verification"] !== undefined && obj["verification"] !== null) {
    if (typeof obj["verification"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: verification must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const verif = obj["verification"] as Record<string, unknown>;
    if (verif["commands"] !== undefined) {
      if (!Array.isArray(verif["commands"])) {
        throw Object.assign(
          new Error("CONFIG_INVALID: verification.commands must be an array."),
          { code: "CONFIG_INVALID" },
        );
      }
      const commands = verif["commands"] as unknown[];
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        if (typeof cmd === "string") {
          if (cmd.length === 0) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: verification.commands[${i}] must be a non-empty string.`),
              { code: "CONFIG_INVALID" },
            );
          }
        } else if (typeof cmd === "object" && cmd !== null) {
          const cmdObj = cmd as Record<string, unknown>;
          if (typeof cmdObj["run"] !== "string" || cmdObj["run"].length === 0) {
            throw Object.assign(
              new Error(`CONFIG_INVALID: verification.commands[${i}].run must be a non-empty string.`),
              { code: "CONFIG_INVALID" },
            );
          }
          if (cmdObj["name"] !== undefined && typeof cmdObj["name"] !== "string") {
            throw Object.assign(
              new Error(`CONFIG_INVALID: verification.commands[${i}].name must be a string.`),
              { code: "CONFIG_INVALID" },
            );
          }
        } else {
          throw Object.assign(
            new Error(`CONFIG_INVALID: verification.commands[${i}] must be a string or object with a run field.`),
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

    const isManagedRuntime = runtime === "managed";

    const checkModel = (model: string, path: string): void => {
      if (!allModelNames.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: ${path} "${model}" is not in the model registry. Add it to config.models.`),
          { code: "CONFIG_INVALID" },
        );
      }
      if (isManagedRuntime && openaiModels.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: OpenAI model "${model}" cannot be used with runtime "managed".`),
          { code: "CONFIG_INVALID" },
        );
      }
    };

    for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
      const model = collectStepModel(stepKey, stepVal);
      if (model !== undefined) {
        checkModel(model, `steps.${stepKey}.model`);
      }

      // Also validate models inside byRequestType entries
      if (typeof stepVal === "object" && stepVal !== null) {
        const byRT = (stepVal as Record<string, unknown>)["byRequestType"];
        if (typeof byRT === "object" && byRT !== null) {
          for (const [typeKey, typeVal] of Object.entries(byRT as Record<string, unknown>)) {
            const typeModel = collectStepModel(`${stepKey}.byRequestType.${typeKey}`, typeVal);
            if (typeModel !== undefined) {
              checkModel(typeModel, `steps.${stepKey}.byRequestType.${typeKey}.model`);
            }
          }
        }
      }
    }
  }

  // Validate github section if provided
  if (obj["github"] !== undefined && obj["github"] !== null) {
    if (typeof obj["github"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: github must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const githubObj = obj["github"] as Record<string, unknown>;
    if (githubObj["host"] !== undefined) {
      const host = githubObj["host"];
      if (typeof host !== "string" || host.length === 0) {
        throw Object.assign(
          new Error("CONFIG_INVALID: github.host must be a non-empty string."),
          { code: "CONFIG_INVALID" },
        );
      }
    }
    if (githubObj["apiBaseUrl"] !== undefined) {
      const apiBaseUrl = githubObj["apiBaseUrl"];
      if (typeof apiBaseUrl !== "string" || apiBaseUrl.length === 0) {
        throw Object.assign(
          new Error("CONFIG_INVALID: github.apiBaseUrl must be a non-empty string."),
          { code: "CONFIG_INVALID" },
        );
      }
      if (!apiBaseUrl.startsWith("https://")) {
        throw Object.assign(
          new Error("CONFIG_INVALID: github.apiBaseUrl must start with https://."),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }

  // Validate logs section if provided
  if (obj["logs"] !== undefined && obj["logs"] !== null) {
    if (typeof obj["logs"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: logs must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const logsObj = obj["logs"] as Record<string, unknown>;
    if (logsObj["maxJobs"] !== undefined) {
      const maxJobs = logsObj["maxJobs"];
      if (typeof maxJobs !== "number" || !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 1000) {
        throw Object.assign(
          new Error("CONFIG_INVALID: logs.maxJobs must be an integer between 1 and 1000."),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }

  // Validate archive section if provided
  if (obj["archive"] !== undefined && obj["archive"] !== null) {
    if (typeof obj["archive"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: archive must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const archiveObj = obj["archive"] as Record<string, unknown>;

    if (archiveObj["mergeWaitTimeoutMs"] !== undefined) {
      const v = archiveObj["mergeWaitTimeoutMs"];
      if (v !== null) {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
          throw Object.assign(
            new Error("CONFIG_INVALID: archive.mergeWaitTimeoutMs must be a non-negative integer or null."),
            { code: "CONFIG_INVALID" },
          );
        }
      }
    }

    if (archiveObj["mergeWaitPollIntervalMs"] !== undefined) {
      const v = archiveObj["mergeWaitPollIntervalMs"];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
        throw Object.assign(
          new Error("CONFIG_INVALID: archive.mergeWaitPollIntervalMs must be a positive integer."),
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

