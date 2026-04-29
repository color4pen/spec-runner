/**
 * Custom tool definition shape (matches Anthropic SDK BetaManagedAgentsCustomToolParams).
 * Defined here without SDK import to keep core/ free of @anthropic-ai/sdk dependencies.
 */
export interface CustomToolDefinition {
  type: "custom";
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

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

/**
 * Combined definition + handler for a custom tool.
 * Use defineCustomTool() factory to create.
 */
export interface CustomTool {
  definition: CustomToolDefinition;
  handler: CustomToolHandler;
}

/**
 * Factory to define a custom tool with colocated definition and handler.
 * This is the ONLY way to create a CustomTool — enforcing colocate pattern.
 */
export function defineCustomTool(tool: CustomTool): CustomTool {
  return tool;
}
