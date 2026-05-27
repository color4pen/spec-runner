import Anthropic from "@anthropic-ai/sdk";

export type AnthropicClient = Anthropic;

/**
 * Create an Anthropic client configured for Managed Agents Beta.
 */
export function createAnthropicClient(apiKey: string): AnthropicClient {
  return new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
    defaultHeaders: {
      "anthropic-beta": "managed-agents-2026-04-01",
    },
  });
}
