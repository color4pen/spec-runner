/**
 * Context passed to a custom tool handler.
 */
export interface CustomToolContext {
  sessionId: string;
}

/**
 * Result type returned by a custom tool handler.
 */
export type CustomToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/**
 * Handler function type for a custom tool.
 */
export type CustomToolHandler = (
  input: Record<string, unknown>,
  ctx: CustomToolContext,
) => Promise<CustomToolResult>;

