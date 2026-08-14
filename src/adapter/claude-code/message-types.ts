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
    content_block: { type: "tool_use"; name: string; id?: string; input?: Record<string, unknown> };
  };
} {
  if (!isStreamEvent(v)) return false;
  const event = v.event;
  if (event["type"] !== "content_block_start") return false;
  const cb = event["content_block"];
  if (typeof cb !== "object" || cb === null) return false;
  return (cb as Record<string, unknown>)["type"] === "tool_use";
}

/**
 * Type guard for a tool_result user message.
 * True when v.type === "user" and v.message.content contains at least one
 * block with type === "tool_result". Mirrors the defensive style of isToolUse.
 */
export function isToolResult(
  v: unknown,
): v is { type: "user"; message: { content: Array<{ type: string; tool_use_id?: string }> } } {
  if (typeof v !== "object" || v === null) return false;
  const rec = v as Record<string, unknown>;
  if (rec["type"] !== "user") return false;
  const message = rec["message"];
  if (typeof message !== "object" || message === null) return false;
  const content = (message as Record<string, unknown>)["content"];
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.some(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>)["type"] === "tool_result",
  );
}
