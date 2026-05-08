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
