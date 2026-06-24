import type { SpecRunnerConfig } from "./schema.js";

export type Provider = "anthropic" | "openai";

export interface ModelEntry {
  provider: Provider;
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
}

export const BUILTIN_MODEL_REGISTRY: ModelsConfig = {
  "claude-opus-4-8":       { provider: "anthropic" },
  "claude-opus-4-8[1m]":   { provider: "anthropic" },
  "claude-opus-4-7":       { provider: "anthropic" },
  "claude-opus-4-6":       { provider: "anthropic" },
  "claude-opus-4-6[1m]":   { provider: "anthropic" },
  "claude-sonnet-4-6":     { provider: "anthropic" },
  "claude-sonnet-4-5":     { provider: "anthropic" },
  "claude-opus-4-5":       { provider: "anthropic" },
  "claude-haiku-4-5":      { provider: "anthropic" },
  "gpt-5.5":               { provider: "openai" },
  "gpt-5.4":               { provider: "openai" },
  "gpt-5.4-mini":          { provider: "openai" },
  "gpt-5.3-codex-spark":   { provider: "openai" },
};

/**
 * Per-provider default models used by `specrunner init` scaffold generation.
 *
 * - `defaults`: written to `steps.defaults.model` (all steps)
 * - `design`:   written to `steps.design.model` when defined (high-quality step override)
 *               Undefined means the step-definition hardcoded model resolves at level 5.
 *
 * Invariant: every model name listed here MUST exist in BUILTIN_MODEL_REGISTRY.
 *   anthropic.defaults  → "claude-sonnet-4-6"    ✓ in BUILTIN_MODEL_REGISTRY
 *   openai.defaults     → "gpt-5.4-mini"         ✓ in BUILTIN_MODEL_REGISTRY
 *   openai.design       → "gpt-5.5"              ✓ in BUILTIN_MODEL_REGISTRY
 */
export interface ProviderDefaults {
  /** Model for all steps (steps.defaults.model in generated config). */
  defaults: string;
  /** Model for design step (steps.design.model in generated config). Omit to inherit hardcoded default. */
  design?: string;
}

export const PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults> = {
  anthropic: {
    defaults: "claude-sonnet-4-6",
    // design is intentionally absent: DesignStep hardcodes claude-opus-4-6[1m] at level 5,
    // matching the legacy scaffold shape (design.md D3).
  },
  openai: {
    defaults: "gpt-5.4-mini",
    design: "gpt-5.5",
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
