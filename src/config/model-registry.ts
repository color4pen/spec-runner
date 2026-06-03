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
  "claude-sonnet-4-6": { provider: "anthropic" },
  "claude-sonnet-4-5": { provider: "anthropic" },
  "claude-opus-4-5":   { provider: "anthropic" },
  "claude-haiku-4-5":  { provider: "anthropic" },
  "o3":                { provider: "openai" },
  "gpt-5.4":           { provider: "openai" },
  "gpt-5.3-codex":     { provider: "openai" },
  "gpt-5.2-codex":     { provider: "openai" },
  "gpt-5.1":           { provider: "openai" },
  "gpt-5.5":           { provider: "openai" },
};

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
