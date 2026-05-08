/**
 * Type guards and utilities for Claude Code SDK messages.
 *
 * Centralised here so that multiple callers (create command, future dialog layer, etc.)
 * share the same implementation without depending on adapter-layer SDKMessage types directly.
 */

/**
 * Type guard for SDK result messages.
 * Matches the shape of SDKResultMessage without importing the concrete SDK type.
 */
export function isResultMessage(
  v: unknown,
): v is { type: "result"; subtype: string; result?: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    (v as Record<string, unknown>)["type"] === "result" &&
    "subtype" in v
  );
}

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
 * Type guard for a text_delta event within a stream_event message.
 * Checks: event.type === "content_block_delta" && event.delta.type === "text_delta".
 * Narrows to a shape where event.delta.text is a string.
 */
export function isTextDelta(
  v: unknown,
): v is {
  type: "stream_event";
  event: {
    type: "content_block_delta";
    delta: { type: "text_delta"; text: string };
  };
} {
  if (!isStreamEvent(v)) return false;
  const event = v.event;
  if (event["type"] !== "content_block_delta") return false;
  const delta = event["delta"];
  if (typeof delta !== "object" || delta === null) return false;
  return (
    (delta as Record<string, unknown>)["type"] === "text_delta" &&
    typeof (delta as Record<string, unknown>)["text"] === "string"
  );
}

/**
 * Type guard for tool_use_summary messages.
 * These are emitted by the SDK to summarise tool calls during an agent turn.
 */
export function isToolUseSummary(
  v: unknown,
): v is { type: "tool_use_summary"; summary: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>)["type"] === "tool_use_summary" &&
    typeof (v as Record<string, unknown>)["summary"] === "string"
  );
}
