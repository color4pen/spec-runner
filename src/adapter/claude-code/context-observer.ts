/**
 * Context observer for Claude Code SDK messages.
 *
 * Pure module — no I/O, no SDK runtime imports, no node:fs, no child_process.
 * Observes SDK message events and accumulates provider-native context metrics.
 *
 * Design D1 (agent-context-observability):
 *   - Only assistant messages that are NOT sub-agent (parent_tool_use_id === null/undefined)
 *     and NOT replay (isReplay !== true) count toward active context observation.
 *   - compact_boundary system events update compaction metrics (count + before/after).
 *   - observeResult reads contextWindow from the result's modelUsage record.
 *   - markExhaustion classifies error text and sets exhaustionAtTokens to the last
 *     observed active context value (never 0 or fabricated).
 *
 * peakActiveContextTokens = max over all observed turns of:
 *   input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 * (where missing fields are treated as 0).
 *
 * contextTokensBeforeCompaction / contextTokensAfterCompaction: last observed compaction wins.
 * post_tokens absent → after is NOT carried over from a previous compaction (undefined).
 */
import type { AgentContextMetrics } from "../../kernel/context-metrics.js";

/**
 * Classify a text string as a context exhaustion error.
 *
 * Uses case-insensitive substring matching against an allowlist.
 * Unknown error strings return false (fail-closed) — only known patterns trigger exhaustion
 * recording. This prevents false positives from unrelated error messages.
 *
 * The list is intentionally minimal to stay fail-closed; it covers the observed error
 * messages from Claude Code SDK context limit events.
 */
export function isContextExhaustionError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("prompt is too long") ||
    lower.includes("context length exceeded") ||
    lower.includes("context window exceeded")
  );
}

export interface ContextObserver {
  /**
   * Observe one SDK message.
   * - assistant messages (non-sub-agent, non-replay): update peak/last active context.
   * - system compact_boundary messages: update compaction metrics.
   * All other messages are ignored.
   */
  observe(message: unknown): void;
  /**
   * Observe the SDK result message to extract contextWindow from modelUsage.
   * Reads modelUsage[resolvedModel].contextWindow (preferred) or the max across all keys.
   */
  observeResult(rawResult: Record<string, unknown>): void;
  /**
   * Classify error text and set exhaustionAtTokens to the last observed active context.
   * No-op when: the text does not match the exhaustion allowlist, OR no active context
   * observation has been made. Never writes 0 or a fabricated value.
   */
  markExhaustion(errorText: string): void;
  /**
   * Return accumulated metrics, or undefined if no observations were made.
   * A record is only returned when at least one observable field has a value.
   */
  snapshot(): AgentContextMetrics | undefined;
}

/**
 * Create a new context observer for a single agent invocation.
 *
 * @param input.provider - Provider identifier (e.g. "claude-code").
 * @param input.model    - Resolved model identifier (optional).
 */
export function createContextObserver(input: { provider: string; model?: string }): ContextObserver {
  const { provider, model } = input;

  // Observable state
  let peakActiveContextTokens: number | undefined;
  let lastActiveContextTokens: number | undefined;
  let contextWindowTokens: number | undefined;
  let compactionCount: number | undefined;
  let contextTokensBeforeCompaction: number | undefined;
  let contextTokensAfterCompaction: number | undefined;
  let exhaustionAtTokens: number | undefined;

  return {
    observe(message: unknown): void {
      if (message === null || typeof message !== "object") return;
      const msg = message as Record<string, unknown>;
      const type = msg["type"];

      // ---- assistant message: peak / last active context ----
      if (type === "assistant") {
        // Exclude sub-agent messages (parent_tool_use_id is set)
        const parentToolUseId = msg["parent_tool_use_id"];
        if (parentToolUseId !== null && parentToolUseId !== undefined) return;
        // Exclude replayed messages from prior sessions
        if (msg["isReplay"] === true) return;

        // Extract usage from message.usage
        const usage = msg["usage"];
        if (usage === null || typeof usage !== "object") return;
        const u = usage as Record<string, unknown>;

        const inputTokens = typeof u["input_tokens"] === "number" ? u["input_tokens"] : 0;
        const cacheRead = typeof u["cache_read_input_tokens"] === "number" ? u["cache_read_input_tokens"] : 0;
        const cacheCreate = typeof u["cache_creation_input_tokens"] === "number" ? u["cache_creation_input_tokens"] : 0;

        // If all three values are 0 (or missing), treat as not observable
        if (inputTokens === 0 && cacheRead === 0 && cacheCreate === 0) {
          // Check if ALL were missing (not provided at all vs. explicitly 0)
          const anyPresent =
            typeof u["input_tokens"] === "number" ||
            typeof u["cache_read_input_tokens"] === "number" ||
            typeof u["cache_creation_input_tokens"] === "number";
          if (!anyPresent) return;
        }

        const activeContext = inputTokens + cacheRead + cacheCreate;
        lastActiveContextTokens = activeContext;
        if (peakActiveContextTokens === undefined || activeContext > peakActiveContextTokens) {
          peakActiveContextTokens = activeContext;
        }
        return;
      }

      // ---- system compact_boundary: compaction metrics ----
      if (type === "system") {
        const subtype = msg["subtype"];
        if (subtype !== "compact_boundary") return;

        compactionCount = (compactionCount ?? 0) + 1;

        const meta = msg["compact_metadata"];
        if (meta !== null && typeof meta === "object") {
          const m = meta as Record<string, unknown>;
          if (typeof m["pre_tokens"] === "number") {
            contextTokensBeforeCompaction = m["pre_tokens"];
          }
          // post_tokens: if present, update after; if absent, do NOT carry over previous value
          if (typeof m["post_tokens"] === "number") {
            contextTokensAfterCompaction = m["post_tokens"];
          } else {
            // No post_tokens reported — clear the after value (do not keep stale data)
            contextTokensAfterCompaction = undefined;
          }
        }
      }
    },

    observeResult(rawResult: Record<string, unknown>): void {
      const modelUsage = rawResult["modelUsage"];
      if (modelUsage === null || typeof modelUsage !== "object") return;
      const mu = modelUsage as Record<string, unknown>;

      // Prefer the resolved model key's contextWindow
      if (model && typeof mu[model] === "object" && mu[model] !== null) {
        const modelEntry = mu[model] as Record<string, unknown>;
        if (typeof modelEntry["contextWindow"] === "number") {
          contextWindowTokens = modelEntry["contextWindow"];
          return;
        }
      }

      // Fall back to the max contextWindow across all model keys
      let maxContextWindow: number | undefined;
      for (const key of Object.keys(mu)) {
        const entry = mu[key];
        if (entry !== null && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          if (typeof e["contextWindow"] === "number") {
            if (maxContextWindow === undefined || e["contextWindow"] > maxContextWindow) {
              maxContextWindow = e["contextWindow"];
            }
          }
        }
      }
      if (maxContextWindow !== undefined) {
        contextWindowTokens = maxContextWindow;
      }
    },

    markExhaustion(errorText: string): void {
      if (!isContextExhaustionError(errorText)) return;
      // Only set exhaustionAtTokens if we have an observed active context value
      if (lastActiveContextTokens !== undefined) {
        exhaustionAtTokens = lastActiveContextTokens;
      }
    },

    snapshot(): AgentContextMetrics | undefined {
      // Return undefined if no observable fields have values
      const hasAnyValue =
        peakActiveContextTokens !== undefined ||
        contextWindowTokens !== undefined ||
        compactionCount !== undefined ||
        contextTokensBeforeCompaction !== undefined ||
        contextTokensAfterCompaction !== undefined ||
        exhaustionAtTokens !== undefined;

      if (!hasAnyValue) return undefined;

      return {
        provider,
        ...(model !== undefined ? { model } : {}),
        ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
        ...(peakActiveContextTokens !== undefined ? { peakActiveContextTokens } : {}),
        ...(compactionCount !== undefined ? { compactionCount } : {}),
        ...(contextTokensBeforeCompaction !== undefined ? { contextTokensBeforeCompaction } : {}),
        ...(contextTokensAfterCompaction !== undefined ? { contextTokensAfterCompaction } : {}),
        ...(exhaustionAtTokens !== undefined ? { exhaustionAtTokens } : {}),
      };
    },
  };
}
