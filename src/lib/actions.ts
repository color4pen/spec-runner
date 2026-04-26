'use server';

import { revalidatePath } from 'next/cache';
import { getAnthropicClient } from './anthropic';
import { getAuthenticatedUser } from './auth-helpers';
import { verifySessionAccessByManagedId } from './session-actions';
import { REGISTER_BRANCH_TOOL } from './register-branch-tool';
import type { BetaManagedAgentsGitHubRepositoryResourceParams } from '@anthropic-ai/sdk/resources/beta/sessions/sessions';

export interface SessionEventData {
  type: string;
  id?: string;
  content?: Array<{ type: string; text?: string }>;
  name?: string;
  input?: Record<string, unknown>;
  message?: string;
  stop_reason?: { type: string };
  processed_at?: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  model: string;
  createdAt: string;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface ApiSessionSummary {
  id: string;
  agentId: string;
  environmentId: string;
  repositoryUrl?: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
}

export async function listAgents(): Promise<AgentSummary[]> {
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  const result: AgentSummary[] = [];
  for await (const agent of client.beta.agents.list()) {
    result.push({
      id: agent.id,
      name: agent.name,
      model: typeof agent.model === 'string' ? agent.model : agent.model.id,
      createdAt: agent.created_at,
    });
  }
  return result;
}

export async function createAgent(formData: {
  name: string;
  systemPrompt?: string;
}): Promise<AgentSummary> {
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  const agent = await client.beta.agents.create({
    name: formData.name,
    model: 'claude-sonnet-4-6',
    system: formData.systemPrompt || undefined,
    tools: [{ type: 'agent_toolset_20260401' }, REGISTER_BRANCH_TOOL],
  });
  revalidatePath('/');
  return {
    id: agent.id,
    name: agent.name,
    model: typeof agent.model === 'string' ? agent.model : agent.model.id,
    createdAt: agent.created_at,
  };
}

export async function listEnvironments(): Promise<EnvironmentSummary[]> {
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  const result: EnvironmentSummary[] = [];
  for await (const env of client.beta.environments.list()) {
    result.push({
      id: env.id,
      name: env.name,
      createdAt: env.created_at,
    });
  }
  return result;
}

export async function createEnvironment(formData: {
  name: string;
}): Promise<EnvironmentSummary> {
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  const env = await client.beta.environments.create({
    name: formData.name,
    config: {
      type: 'cloud',
      networking: {
        type: 'limited',
        allow_package_managers: true,
        allowed_hosts: ['github.com', 'api.github.com'],
      },
      packages: {
        npm: ['@fission-ai/openspec'],
      },
    },
  });
  revalidatePath('/');
  return {
    id: env.id,
    name: env.name,
    createdAt: env.created_at,
  };
}

export async function listSessions(): Promise<ApiSessionSummary[]> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Debug actions are not available in production');
  }
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  const result: ApiSessionSummary[] = [];
  for await (const session of client.beta.sessions.list({
    include_archived: true,
  })) {
    const githubResource = session.resources.find(
      (r) => r.type === 'github_repository'
    );
    result.push({
      id: session.id,
      agentId: session.agent.id,
      environmentId: session.environment_id,
      repositoryUrl: githubResource?.url,
      status: session.status,
      createdAt: session.created_at,
      archivedAt: session.archived_at,
    });
  }
  return result;
}

export async function createSession(formData: {
  agentId: string;
  environmentId: string;
  repositoryUrl?: string;
  mountPath?: string;
}): Promise<ApiSessionSummary> {
  // Use OAuth token instead of GITHUB_TOKEN environment variable
  const user = await getAuthenticatedUser();
  const client = getAnthropicClient();

  const resources: BetaManagedAgentsGitHubRepositoryResourceParams[] = [];
  if (formData.repositoryUrl) {
    resources.push({
      type: 'github_repository',
      url: formData.repositoryUrl,
      authorization_token: user.accessToken,
      mount_path: formData.mountPath || undefined,
    });
  }

  const session = await client.beta.sessions.create({
    agent: formData.agentId,
    environment_id: formData.environmentId,
    resources: resources.length > 0 ? resources : undefined,
  });

  revalidatePath('/');

  const githubResource = session.resources.find(
    (r) => r.type === 'github_repository'
  );
  return {
    id: session.id,
    agentId: session.agent.id,
    environmentId: session.environment_id,
    repositoryUrl: githubResource?.url,
    status: session.status,
    createdAt: session.created_at,
    archivedAt: session.archived_at,
  };
}

export async function archiveSession(sessionId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Debug actions are not available in production');
  }
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  await client.beta.sessions.archive(sessionId);
  revalidatePath('/');
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Debug actions are not available in production');
  }
  await getAuthenticatedUser();
  const client = getAnthropicClient();
  await client.beta.sessions.delete(sessionId);
  revalidatePath('/');
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<void> {
  // Verify the authenticated user owns this session
  await verifySessionAccessByManagedId(sessionId);
  const client = getAnthropicClient();
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: message }],
      },
    ],
  });
}

export async function listSessionEvents(
  sessionId: string,
  limit = 200
): Promise<SessionEventData[]> {
  // Verify the authenticated user owns this session
  await verifySessionAccessByManagedId(sessionId);
  const client = getAnthropicClient();
  const collected: SessionEventData[] = [];
  for await (const event of client.beta.sessions.events.list(sessionId, {
    order: 'desc',
  })) {
    collected.push(event as unknown as SessionEventData);
    if (collected.length >= limit) break;
  }
  return collected.reverse();
}
