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
}

/**
 * The structure of usage.json files.
 * Append-only: entries are never deleted or overwritten.
 */
export interface UsageFile {
  commandInvocations: CommandInvocation[];
}
