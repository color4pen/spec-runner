import type { ModelUsage } from "../../core/port/model-usage.js";

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

/**
 * Codex input includes cache reads and writes; ModelUsage categories are exclusive.
 * Output already includes reasoning. This conversion does not resolve the SDK's
 * cumulative/resumed usage scope; it only prevents charging a token twice.
 */
export function normalizeCodexUsage(usage: CodexUsage): ModelUsage {
  const cacheRead = usage.cached_input_tokens ?? 0;
  const cacheWrite = usage.cache_write_input_tokens ?? 0;
  return {
    inputTokens: usage.input_tokens - cacheRead - cacheWrite,
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheWrite,
  };
}
