import type Anthropic from "@anthropic-ai/sdk";

// Re-export SDK types for consumers
export type BetaEnvironment = Awaited<
  ReturnType<Anthropic["beta"]["environments"]["create"]>
>;
export type CreateEnvironmentParams = Parameters<
  Anthropic["beta"]["environments"]["create"]
>[0];

/**
 * Create a new Managed Environment with npm packages.
 */
export async function createEnvironment(
  client: Anthropic,
  params: CreateEnvironmentParams,
): Promise<BetaEnvironment> {
  return client.beta.environments.create(params);
}

/**
 * Retrieve an existing Managed Environment by ID.
 */
export async function retrieveEnvironment(
  client: Anthropic,
  environmentId: string,
): Promise<BetaEnvironment> {
  return client.beta.environments.retrieve(environmentId);
}
