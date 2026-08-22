/**
 * Types for usage.json — append-only record of token usage per command invocation.
 */
import type { ModelUsage } from "../port/model-usage.js";
import type { AgentContextMetrics } from "../../kernel/context-metrics.js";

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
   * SDK result num_turns. Covers the main-work query turn only; follow-up turns
   * (postWorkPrompts / report_result retries / outputVerification repair) are each
   * separate SDK queries and their num_turns are NOT included here.
   * For the additional turn count, see StepRun.outcome.addedTurns.
   * undefined if the runtime does not provide this value (managed runtime, Codex adapter)
   * or if this entry was written before the agent-invocation-metrics feature was added
   * (backward-compatible with pre-agent-invocation-metrics usage.json).
   */
  numTurns?: number;
  /**
   * Total wall-clock time for this invocation in milliseconds.
   * SDK result duration_ms. Covers the main-work query turn only (same scope as numTurns).
   * undefined if the runtime does not provide this value
   * or if this entry predates the agent-invocation-metrics feature.
   */
  durationMs?: number;
  /**
   * API wait time for this invocation in milliseconds.
   * SDK result duration_api_ms. Covers the main-work query turn only (same scope as numTurns).
   * undefined if the runtime does not provide this value
   * or if this entry predates the agent-invocation-metrics feature.
   */
  durationApiMs?: number;
  /**
   * SDK-measured cost in USD for this invocation.
   * SDK result total_cost_usd. Does not require a pricing table lookup.
   * Covers the main-work query turn only; follow-up turns (postWorkPrompts /
   * report_result retries / outputVerification repair) are NOT included.
   * For all-turn cost, use modelUsage with computeCostUsd — modelUsage accumulates
   * all turns in agent-runner.
   * Note: for models absent from the pricing table, computeCostUsd returns null;
   * in those runs totalCostUsd is the only available cost value.
   * undefined if the runtime does not provide this value or if this entry
   * predates the agent-invocation-metrics feature.
   */
  totalCostUsd?: number;
  /**
   * Marks a context-observation-only entry.
   *
   * true = this entry was appended solely to persist contextMetrics (halt paths:
   * post-success drift / output-gate / commit-fail / context exhaustion, or a success
   * whose provider returned no usage but did report context metrics). Such entries
   * carry modelUsage: null but MUST NOT be interpreted as "usage unavailable" —
   * cost / turn aggregation skips them entirely so results stay identical to the
   * entry being absent.
   *
   * absent = normal entry. modelUsage: null on an unmarked entry keeps its original
   * meaning: usage was unavailable for a real invocation (e.g. managed runtime), and
   * aggregation must treat the step cost as unknown (unpriced), not as zero.
   * Added in agent-context-observability.
   */
  contextOnly?: true;
  /**
   * Active context and compaction metrics for this invocation.
   * Stored as a nested object (unlike scalar invocationMetrics fields above).
   *
   * absent = the invocation did not observe any context metrics (either the provider
   * does not support reporting context size / compaction, or the metrics feature
   * was not yet available when this entry was written — backward compatible).
   *
   * Values are NEVER derived from cumulative modelUsage fields. absent means absent.
   * Added in agent-context-observability.
   */
  contextMetrics?: AgentContextMetrics;
}

/**
 * The structure of usage.json files.
 * Append-only: entries are never deleted or overwritten.
 */
export interface UsageFile {
  commandInvocations: CommandInvocation[];
}
