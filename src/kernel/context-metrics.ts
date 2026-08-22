/**
 * Provider-neutral context metrics for an agent invocation.
 *
 * This type is intentionally separate from the cumulative ModelUsage:
 * (a) These values MUST NOT be derived or computed from cumulative ModelUsage fields
 *     (inputTokens / outputTokens / cacheReadInputTokens / cacheCreationInputTokens).
 *     Cumulative usage and active context size are distinct concepts.
 * (b) `peakActiveContextTokens` is the MAXIMUM, across all observed turns in the
 *     invocation, of (input_tokens + cache_read_input_tokens + cache_creation_input_tokens)
 *     reported by the provider for a single request. This represents the largest
 *     active context that the provider had to process, not a sum across turns.
 * (c) `contextTokensBeforeCompaction` and `contextTokensAfterCompaction` are the
 *     values from the LAST observed compaction event; earlier compactions are not
 *     preserved (only the most recent before/after pair is kept).
 * (d) `exhaustionAtTokens` is the active context size that was observed immediately
 *     before context exhaustion was detected. It is NOT the exact token count at
 *     which overflow occurred — it is the most recently observed value at detection time.
 * (e) All values are invocation-scope: they cover the entire invocation including
 *     any transient retries and follow-up turns within that run() call.
 *
 * When a field cannot be obtained from the provider (no reporting capability, no
 * compaction events observed, etc.), it is absent (undefined) — never 0 or null.
 *
 * This module has zero imports from src/ (pure type module).
 */
export interface AgentContextMetrics {
  /** Provider identifier (e.g. "claude-code", "codex", "managed"). Required. */
  provider: string;
  /** Model identifier (e.g. "claude-sonnet-4-5"). Optional — may not always be resolved. */
  model?: string;
  /** Context window size reported by the provider for this invocation (in tokens). */
  contextWindowTokens?: number;
  /**
   * Maximum active context observed during this invocation (in tokens).
   * Computed as max(input_tokens + cache_read_input_tokens + cache_creation_input_tokens)
   * across all observed assistant messages. Absent if no assistant messages were observed.
   */
  peakActiveContextTokens?: number;
  /** Number of compaction events observed during this invocation. */
  compactionCount?: number;
  /**
   * Context size (in tokens) immediately BEFORE the last observed compaction.
   * Absent if no compaction was observed or if the event did not report a pre-compaction size.
   */
  contextTokensBeforeCompaction?: number;
  /**
   * Context size (in tokens) immediately AFTER the last observed compaction.
   * Absent if no compaction was observed or if the event did not report a post-compaction size.
   */
  contextTokensAfterCompaction?: number;
  /**
   * Active context size (in tokens) at the time context exhaustion was detected.
   * This is the most recently observed active context value, not the precise overflow point.
   * Absent if exhaustion was not detected or no context observations were available.
   */
  exhaustionAtTokens?: number;
}
