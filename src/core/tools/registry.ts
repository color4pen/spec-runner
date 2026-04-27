import type { CustomTool, CustomToolHandler } from "./types.js";
import type { BetaManagedAgentsCustomToolParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";

/** Internal registry of all registered tools */
const tools: CustomTool[] = [];

/**
 * Register a custom tool in the registry.
 * Called during bootstrap for each tool.
 */
export function registerCustomTool(tool: CustomTool): void {
  // Prevent duplicate registration
  const existing = tools.find((t) => t.definition.name === tool.definition.name);
  if (existing) {
    // Replace (idempotent re-registration during tests)
    const idx = tools.indexOf(existing);
    tools[idx] = tool;
    return;
  }
  tools.push(tool);
}

/**
 * Get all tool definitions for use in agent creation.
 * This is the single source of truth for custom_tools in agent.create/update.
 */
export function getDefinitions(): BetaManagedAgentsCustomToolParams[] {
  return tools.map((t) => t.definition);
}

/**
 * Get the handler for a named tool.
 * Returns undefined if no handler registered for that name.
 */
export function getHandler(name: string): CustomToolHandler | undefined {
  return tools.find((t) => t.definition.name === name)?.handler;
}

/**
 * Reset registry (for testing).
 */
export function resetRegistry(): void {
  tools.length = 0;
}
