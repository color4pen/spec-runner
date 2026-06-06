/**
 * Model pricing table and cost computation utilities for specrunner usage reporting.
 *
 * All pricing values are in USD per 1,000,000 tokens (USD/MTok).
 * Source: Anthropic official pricing — https://www.anthropic.com/pricing (as of 2026-06-07)
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
 * Source: Anthropic official pricing — https://www.anthropic.com/pricing
 * As of: 2026-06-07
 *
 * Note: [1m] suffix denotes the 1M-context tier. The per-token prices listed
 * here are a flat-rate approximation; Anthropic may apply per-prompt thresholds
 * for extended context usage.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Opus 4.8 — standard context
  "claude-opus-4-8": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  // Claude Opus 4.8 — 1M-context tier (flat-rate approximation)
  "claude-opus-4-8[1m]": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  // Claude Opus 4.7 — standard context
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  // Claude Opus 4.6 — standard context
  "claude-opus-4-6": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  // Claude Opus 4.6 — 1M-context tier (flat-rate approximation)
  "claude-opus-4-6[1m]": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  // Claude Opus 4.5 — standard context
  "claude-opus-4-5": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
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
    input: 0.8,
    output: 4.0,
    cacheRead: 0.08,
    cacheWrite: 1.0,
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
