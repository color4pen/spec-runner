/**
 * Pure function for mapping BetaManagedAgentsSessionUsage → SessionUsage.
 *
 * Adapter-layer only: SDK types are allowed here.
 * SDK boundary = adapter directory; this is consistent with completion.ts, sse-stream.ts, etc.
 */
import type { BetaManagedAgentsSessionUsage } from "./sdk/sessions.js";
import type { SessionUsage } from "../../core/port/session-client.js";

/**
 * Map SDK cumulative session usage to the SDK-agnostic SessionUsage shape.
 *
 * - Returns undefined when raw is null/undefined (best-effort contract).
 * - Undefined fields default to 0.
 * - cache_creation ネストを平坦化: ephemeral_1h + ephemeral_5m → cacheCreationInputTokens.
 */
export function mapSessionUsage(
  raw: BetaManagedAgentsSessionUsage | null | undefined,
): SessionUsage | undefined {
  if (raw == null) return undefined;

  const cacheCreation =
    (raw.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
    (raw.cache_creation?.ephemeral_5m_input_tokens ?? 0);

  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: cacheCreation,
  };
}
