/**
 * Model pricing table and cost computation utilities for specrunner usage reporting.
 *
 * All pricing values are in USD per 1,000,000 tokens (USD/MTok).
 *
 * Sources:
 *   Anthropic — SDK-reported modelUsage[].costUSD (measured 2026-08-06)
 *   OpenAI    — https://openai.com/api/pricing/   (as of 2026-06-12)
 */
import type { ModelUsage } from "../port/model-usage.js";

/** USD per 1,000,000 tokens for each token category. */
export interface ModelPricing {
  /** Input tokens (USD/MTok) */
  input: number;
  /** Output tokens (USD/MTok) */
  output: number;
  /** Cache read tokens (USD/MTok) */
  cacheRead: number;
  /** Cache write tokens (USD/MTok) */
  cacheWrite: number;
}

/**
 * Static pricing table indexed by normalized model key.
 *
 * Sources:
 *   Anthropic — SDK-reported modelUsage[].costUSD (measured 2026-08-06)
 *   OpenAI    — https://openai.com/api/pricing/   (as of 2026-06-12)
 *
 * Anthropic rows are derived from single-turn probes whose reported costUSD was
 * solved for the per-category rate. Every Claude row below reproduces its probe
 * to at least 7 decimal places. Across all measured models the derived rates
 * satisfy cacheRead = input x 0.1 and cacheWrite = input x 1.25; the 1.25 factor
 * held even when the entire cache write carried a 1-hour TTL
 * (cache_creation.ephemeral_1h_input_tokens), so TTL does not select a rate.
 *
 * Note: [1m] suffix denotes the 1M-context tier. Probes show the 1M-context tier
 * billing at the same per-token rate as standard context, but every probe stayed
 * below 200K tokens; a per-prompt threshold above that range would not appear in
 * these measurements.
 *
 * OpenAI cache notes: cacheRead = cached-input tier price; cacheWrite = 0
 * (OpenAI does not charge for cache write operations).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Opus 4.8 — standard context
  "claude-opus-4-8": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Opus 4.8 — 1M-context tier
  "claude-opus-4-8[1m]": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Opus 4.7 — standard context
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Opus 4.6 — standard context
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Opus 4.6 — 1M-context tier
  "claude-opus-4-6[1m]": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Opus 4.5 — standard context
  "claude-opus-4-5": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  // Claude Sonnet 4.6
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Claude Sonnet 4.5
  "claude-sonnet-4-5": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Claude Haiku 4.5
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },

  // ---------------------------------------------------------------------------
  // OpenAI models
  // Source: https://openai.com/api/pricing/ (as of 2026-06-12)
  // cacheWrite = 0 for all OpenAI models (no cache-write charge)
  // ---------------------------------------------------------------------------

  // o3 — OpenAI official pricing
  "o3": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.1 — approximate using o3 tier (no separate published price as of 2026-06-12)
  "gpt-5.1": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.2-codex — approximate using o3 tier (no separate published price as of 2026-06-12)
  "gpt-5.2-codex": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.3-codex — approximate using o3 tier (no separate published price as of 2026-06-12)
  "gpt-5.3-codex": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.4 — approximate using o3 tier (no separate published price as of 2026-06-12)
  "gpt-5.4": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.5 — approximate using o3 tier (no separate published price as of 2026-06-12)
  "gpt-5.5": {
    input: 10.0,
    output: 40.0,
    cacheRead: 2.5,
    cacheWrite: 0,
  },

  // gpt-5.4-mini — approximate (no separate published price as of 2026-06-25)
  "gpt-5.4-mini": {
    input: 1.5,
    output: 6.0,
    cacheRead: 0.375,
    cacheWrite: 0,
  },

  // gpt-5.3-codex-spark — approximate (no separate published price as of 2026-06-25)
  "gpt-5.3-codex-spark": {
    input: 3.0,
    output: 12.0,
    cacheRead: 0.75,
    cacheWrite: 0,
  },
};

/**
 * Normalize a raw model key for pricing table lookup.
 *
 * Removes trailing date suffixes of the form `-YYYYMMDD` (hyphen + exactly 8 digits).
 * Context-window suffixes such as `[1m]` are preserved as they represent distinct SKUs.
 *
 * Examples:
 *   "claude-haiku-4-5-20251001"   → "claude-haiku-4-5"
 *   "claude-opus-4-6[1m]-20251001"→ "claude-opus-4-6[1m]"
 *   "claude-opus-4-6[1m]"         → "claude-opus-4-6[1m]"  (unchanged)
 *   "claude-sonnet-4-6"           → "claude-sonnet-4-6"     (unchanged)
 */
export function normalizeModelKey(raw: string): string {
  return raw.replace(/-\d{8}$/, "");
}

/**
 * Look up pricing for a raw model key.
 * Applies normalizeModelKey before table lookup.
 * Returns null if the model is not in the pricing table.
 */
export function lookupPricing(raw: string): ModelPricing | null {
  const key = normalizeModelKey(raw);
  return MODEL_PRICING[key] ?? null;
}

/**
 * Compute USD cost for a model invocation.
 *
 * Returns null if the model is not found in the pricing table.
 * Formula:
 *   cost = inputTokens            / 1e6 * pricing.input
 *        + outputTokens           / 1e6 * pricing.output
 *        + cacheReadInputTokens   / 1e6 * pricing.cacheRead
 *        + cacheCreationInputTokens / 1e6 * pricing.cacheWrite
 */
export function computeCostUsd(model: string, usage: ModelUsage): number | null {
  const pricing = lookupPricing(model);
  if (pricing === null) return null;

  return (
    (usage.inputTokens / 1e6) * pricing.input +
    (usage.outputTokens / 1e6) * pricing.output +
    (usage.cacheReadInputTokens / 1e6) * pricing.cacheRead +
    (usage.cacheCreationInputTokens / 1e6) * pricing.cacheWrite
  );
}

/**
 * Format a USD cost value for display.
 *
 * Returns "$?" for null (unknown pricing).
 * Returns "$x.xxxx" (4 decimal places) for numeric values.
 */
export function formatUsd(value: number | null): string {
  if (value === null) return "$?";
  return "$" + value.toFixed(4);
}
