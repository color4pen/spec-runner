import type { SpecRunnerConfig } from "./schema.js";

export type Provider = "anthropic" | "openai";

export interface ModelEntry {
  provider: Provider;
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
}

export const BUILTIN_MODEL_REGISTRY: ModelsConfig = {
  "claude-opus-4-8":     { provider: "anthropic" },
  "claude-opus-4-8[1m]": { provider: "anthropic" },
  "claude-opus-4-7":   { provider: "anthropic" },
  "claude-opus-4-6":   { provider: "anthropic" },
  "claude-opus-4-6[1m]": { provider: "anthropic" },
  "claude-sonnet-4-6": { provider: "anthropic" },
  "claude-sonnet-4-5": { provider: "anthropic" },
  "claude-opus-4-5":   { provider: "anthropic" },
  "claude-haiku-4-5":  { provider: "anthropic" },
  "gpt-5.5":           { provider: "openai" },
  "gpt-5.4":           { provider: "openai" },
  "gpt-5.4-mini":      { provider: "openai" },
  "gpt-5.3-codex-spark": { provider: "openai" },
};

/**
 * Provider-specific default models used by `specrunner init` to scaffold config.
 * - `defaultModel`: written to `steps.defaults.model`
 * - `designModel`: when defined, written to `steps.design.model` (higher-quality model for design step).
 *   When omitted, design step falls back to its built-in default (e.g. claude-opus-4-6[1m] for anthropic).
 */
export interface ProviderDefaults {
  /** Default model for all steps (`steps.defaults.model`). */
  defaultModel: string;
  /** Optional override for design step (`steps.design.model`). */
  designModel?: string;
}

/**
 * Per-provider scaffold defaults.
 *
 * anthropic: designModel is omitted intentionally — design.ts:12 already hard-codes
 * claude-opus-4-6[1m] as its built-in default, so omitting preserves legacy scaffold
 * byte-equality (no extra `steps.design` block written to config).
 */
export const PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults> = {
  anthropic: {
    defaultModel: "claude-sonnet-4-6",
  },
  openai: {
    defaultModel: "gpt-5.4-mini",
    designModel: "gpt-5.5",
  },
};

/**
 * Fallback model for one-shot queries when config resolution chain yields no model.
 * Used by query-one-shot.ts; override via config.steps.defaults.model or opts.model.
 */
export const DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5";

/**
 * Merge built-in registry with user-defined models.
 * User entries override built-ins (same key → user wins).
 */
export function mergeModelRegistry(config: SpecRunnerConfig): ModelsConfig {
  return { ...BUILTIN_MODEL_REGISTRY, ...(config.models ?? {}) };
}

/**
 * Resolve provider for a model name from the merged registry.
 * Throws CONFIG_INVALID for unknown model names.
 */
export function resolveProvider(modelName: string, merged: ModelsConfig): Provider {
  const entry = merged[modelName];
  if (!entry) {
    throw Object.assign(
      new Error(`CONFIG_INVALID: Unknown model "${modelName}". Add it to config.models or use a built-in model.`),
      { code: "CONFIG_INVALID" },
    );
  }
  return entry.provider;
}
