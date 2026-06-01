/**
 * Port interface for Anthropic Agents API operations.
 * Core code uses this interface — SDK types are confined to adapter/anthropic/.
 *
 * Only Agent CRUD operations are exposed here.
 * Session operations remain in SessionClient port.
 */
import type { AgentDefinition } from "../../kernel/agent-definition.js";

/**
 * Runtime record of a retrieved/created agent.
 */
export interface AgentData {
  readonly id: string;
  readonly version: number;
}

/**
 * Port interface for Anthropic Agents API.
 * Implemented in src/adapter/anthropic/anthropic-client.ts.
 */
export interface AnthropicClient {
  /**
   * Create a new Managed Agent.
   * Returns the new agent's ID and version.
   */
  createAgent(def: AgentDefinition): Promise<AgentData>;

  /**
   * Retrieve an existing Managed Agent by ID.
   * Throws with status 404 if not found.
   */
  retrieveAgent(agentId: string): Promise<AgentData>;

  /**
   * Update an existing Managed Agent definition.
   */
  updateAgent(agentId: string, def: AgentDefinition): Promise<AgentData>;

  /**
   * Archive (soft-delete) a Managed Agent.
   * Used for rollback of newly created agents.
   */
  archiveAgent(agentId: string): Promise<void>;
}
