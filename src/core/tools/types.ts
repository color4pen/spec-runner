import type { BetaManagedAgentsCustomToolParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";

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
  definition: BetaManagedAgentsCustomToolParams;
  handler: CustomToolHandler;
}

/**
 * Factory to define a custom tool with colocated definition and handler.
 * This is the ONLY way to create a CustomTool — enforcing colocate pattern.
 */
export function defineCustomTool(tool: CustomTool): CustomTool {
  return tool;
}
