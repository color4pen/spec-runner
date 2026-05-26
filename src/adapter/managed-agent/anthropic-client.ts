/**
 * Adapter implementation of the AnthropicClient port.
 * Wraps Anthropic SDK's Agents API to satisfy core/port/anthropic-client.ts interface.
 *
 * This is the ONLY file in src/ that imports @anthropic-ai/sdk for Agent operations.
 * ToolSpec → SDK Tool type conversion happens here.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsAgentToolset20260401Params, BetaManagedAgentsCustomToolParams } from "@anthropic-ai/sdk/resources/beta/agents/agents.js";
import type { AnthropicClient, AgentData } from "../../core/port/anthropic-client.js";
import type { AgentDefinition, ToolSpec } from "../../core/agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../../core/agent/definition.js";

/**
 * Convert a core ToolSpec to the SDK's tool parameter shape.
 * The SDK accepts both agent toolset and custom tool shapes.
 */
function toSdkTool(spec: ToolSpec): BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams {
  if (spec.type === AGENT_TOOLSET_TYPE) {
    return { type: spec.type };
  }
  // custom tool
  return {
    type: spec.type,
    name: spec.name,
    description: spec.description,
    input_schema: spec.input_schema,
  };
}

/**
 * Concrete implementation of AnthropicClient port backed by Anthropic SDK.
 */
export class AnthropicClientAdapter implements AnthropicClient {
  constructor(private readonly sdk: Anthropic) {}

  async createAgent(def: AgentDefinition): Promise<AgentData> {
    const agent = await this.sdk.beta.agents.create({
      name: def.name,
      model: def.model,
      system: def.system,
      tools: def.tools.map(toSdkTool),
    });
    return { id: agent.id, version: agent.version };
  }

  async retrieveAgent(agentId: string): Promise<AgentData> {
    const agent = await this.sdk.beta.agents.retrieve(agentId);
    return { id: agent.id, version: agent.version };
  }

  async updateAgent(agentId: string, def: AgentDefinition): Promise<AgentData> {
    const current = await this.sdk.beta.agents.retrieve(agentId);
    const agent = await this.sdk.beta.agents.update(agentId, {
      version: current.version,
      name: def.name,
      system: def.system,
      tools: def.tools.map(toSdkTool),
    });
    return { id: agent.id, version: agent.version };
  }

  async archiveAgent(agentId: string): Promise<void> {
    await this.sdk.beta.agents.archive(agentId);
  }
}

/**
 * Factory function to create AnthropicClientAdapter from API key.
 */
export function createAnthropicClientAdapter(apiKey: string): AnthropicClient {
  const sdk = new Anthropic({ apiKey });
  return new AnthropicClientAdapter(sdk);
}
