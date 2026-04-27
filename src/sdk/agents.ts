import type Anthropic from "@anthropic-ai/sdk";

// Re-export SDK types for consumers
export type BetaAgent = Awaited<ReturnType<Anthropic["beta"]["agents"]["create"]>>;
export type CreateAgentParams = Parameters<Anthropic["beta"]["agents"]["create"]>[0];
export type UpdateAgentParams = Parameters<Anthropic["beta"]["agents"]["update"]>[1];

/**
 * Create a new Managed Agent.
 */
export async function createAgent(
  client: Anthropic,
  params: CreateAgentParams,
): Promise<BetaAgent> {
  return client.beta.agents.create(params);
}

/**
 * Retrieve an existing Managed Agent by ID.
 */
export async function retrieveAgent(
  client: Anthropic,
  agentId: string,
): Promise<BetaAgent> {
  return client.beta.agents.retrieve(agentId);
}

/**
 * Update an existing Managed Agent.
 */
export async function updateAgent(
  client: Anthropic,
  agentId: string,
  params: UpdateAgentParams,
): Promise<BetaAgent> {
  return client.beta.agents.update(agentId, params);
}
