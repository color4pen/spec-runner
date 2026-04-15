// In-memory storage for Phase 1 PoC
// Note: Data is lost on server restart - this is acceptable for Phase 1

import type { BetaManagedAgentsAgent } from '@anthropic-ai/sdk/resources/beta/agents/agents';
import type { BetaEnvironment } from '@anthropic-ai/sdk/resources/beta/environments';
import type { BetaManagedAgentsSession } from '@anthropic-ai/sdk/resources/beta/sessions/sessions';

export interface StoredAgent {
  id: string;
  name: string;
  model: string;
  createdAt: string;
}

export interface StoredEnvironment {
  id: string;
  name: string;
  createdAt: string;
}

export interface StoredSession {
  id: string;
  agentId: string;
  environmentId: string;
  repositoryUrl?: string;
  status: string;
  createdAt: string;
}

// In-memory Maps
const agents = new Map<string, StoredAgent>();
const environments = new Map<string, StoredEnvironment>();
const sessions = new Map<string, StoredSession>();

// Agent operations
export function storeAgent(agent: BetaManagedAgentsAgent): StoredAgent {
  const stored: StoredAgent = {
    id: agent.id,
    name: agent.name,
    model: typeof agent.model === 'string' ? agent.model : agent.model.id,
    createdAt: agent.created_at,
  };
  agents.set(agent.id, stored);
  return stored;
}

export function getAgent(id: string): StoredAgent | undefined {
  return agents.get(id);
}

export function listAgents(): StoredAgent[] {
  return Array.from(agents.values());
}

// Environment operations
export function storeEnvironment(env: BetaEnvironment): StoredEnvironment {
  const stored: StoredEnvironment = {
    id: env.id,
    name: env.name,
    createdAt: env.created_at,
  };
  environments.set(env.id, stored);
  return stored;
}

export function getEnvironment(id: string): StoredEnvironment | undefined {
  return environments.get(id);
}

export function listEnvironments(): StoredEnvironment[] {
  return Array.from(environments.values());
}

// Session operations
export function storeSession(
  session: BetaManagedAgentsSession,
  repositoryUrl?: string
): StoredSession {
  const stored: StoredSession = {
    id: session.id,
    agentId: session.agent.id,
    environmentId: session.environment_id,
    repositoryUrl,
    status: session.status,
    createdAt: session.created_at,
  };
  sessions.set(session.id, stored);
  return stored;
}

export function getSession(id: string): StoredSession | undefined {
  return sessions.get(id);
}

export function updateSessionStatus(id: string, status: string): void {
  const session = sessions.get(id);
  if (session) {
    session.status = status;
  }
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function listSessions(): StoredSession[] {
  return Array.from(sessions.values());
}
