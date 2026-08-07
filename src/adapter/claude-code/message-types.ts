/**
 * Type guards and utilities for Claude Code SDK messages.
 *
 * Centralised here so that multiple callers (create command, future dialog layer, etc.)
 * share the same implementation without depending on adapter-layer SDKMessage types directly.
 */

/**
 * Type guard for SDK stream event messages.
 * Matches the shape of SDKPartialAssistantMessage (type === "stream_event").
 */
export function isStreamEvent(
  v: unknown,
): v is { type: "stream_event"; event: Record<string, unknown> } {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>)["type"] === "stream_event" &&
    typeof (v as Record<string, unknown>)["event"] === "object" &&
    (v as Record<string, unknown>)["event"] !== null
  );
}

/**
 * Type guard for a tool_use content block start within a stream_event message.
 * Checks: event.type === "content_block_start" && event.content_block.type === "tool_use".
 * Narrows to a shape where event.content_block.name is a string.
 */
export function isToolUse(
  v: unknown,
): v is {
  type: "stream_event";
  event: {
    type: "content_block_start";
    content_block: { type: "tool_use"; name: string; input?: Record<string, unknown> };
  };
} {
  if (!isStreamEvent(v)) return false;
  const event = v.event;
  if (event["type"] !== "content_block_start") return false;
  const cb = event["content_block"];
  if (typeof cb !== "object" || cb === null) return false;
  return (cb as Record<string, unknown>)["type"] === "tool_use";
}

