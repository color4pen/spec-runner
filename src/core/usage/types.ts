/**
 * Types for usage.json — append-only record of token usage per command invocation.
 */
import type { ModelUsage } from "../port/model-usage.js";

/**
 * A single command invocation entry in usage.json.
 */
export interface CommandInvocation {
  /** The command that was invoked. */
  command: "request-review" | "request-generate" | "job";
  /** ISO 8601 timestamp of the invocation. */
  timestamp: string;
  /** Per-model token usage. null if usage was unavailable (e.g. managed runtime). */
  modelUsage: Record<string, ModelUsage> | null;
  /** Job ID (present for "job" entries only). */
  jobId?: string;
  /** Step name (present for "job" entries only). */
  stepName?: string;
  /**
   * Number of SDK turns used in this invocation.
   * SDK result num_turns. undefined if the runtime does not provide this value
   * (managed runtime, Codex adapter) or if this entry was written before this
   * feature was added (backward-compatible with pre-agent-invocation-metrics usage.json).
   */
  numTurns?: number;
  /**
   * Total wall-clock time for this invocation in milliseconds.
   * SDK result duration_ms. undefined if the runtime does not provide this value
   * or if this entry predates the agent-invocation-metrics feature.
   */
  durationMs?: number;
  /**
   * API wait time for this invocation in milliseconds.
   * SDK result duration_api_ms. undefined if the runtime does not provide this value
   * or if this entry predates the agent-invocation-metrics feature.
   */
  durationApiMs?: number;
  /**
   * SDK-measured cost in USD for this invocation.
   * SDK result total_cost_usd. Does not require a pricing table lookup.
   * undefined if the runtime does not provide this value or if this entry
   * predates the agent-invocation-metrics feature.
   */
  totalCostUsd?: number;
}

/**
 * The structure of usage.json files.
 * Append-only: entries are never deleted or overwritten.
 */
export interface UsageFile {
  commandInvocations: CommandInvocation[];
}
