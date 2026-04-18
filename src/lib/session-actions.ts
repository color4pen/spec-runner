'use server';

import { revalidatePath } from 'next/cache';
import { getAnthropicClient } from './anthropic';
import { getAuthenticatedUser } from './auth-helpers';
import { verifyRequestOwnership } from './request-actions';
import { getDb } from './db';
import { sessions, requests, repositories, users } from './db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { BetaManagedAgentsGitHubRepositoryResourceParams } from '@anthropic-ai/sdk/resources/beta/sessions/sessions';

export interface SessionSummary {
  id: number;
  requestId: number;
  managedSessionId: string;
  role: string;
  step: string | null;
  status: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Verify that the given session (by DB id) belongs to the authenticated user.
 * Checks: sessions -> requests -> repositories -> users chain.
 * Throws if the session is not found or not owned by the current user.
 */
export async function verifySessionAccess(
  sessionId: number
): Promise<SessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const results = await db
    .select({
      session: sessions,
      request: requests,
      repository: repositories,
    })
    .from(sessions)
    .innerJoin(requests, eq(sessions.requestId, requests.id))
    .innerJoin(repositories, eq(requests.repositoryId, repositories.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(repositories.userId, user.dbId)
      )
    );

  if (results.length === 0) {
    throw new Error('Session not found');
  }

  const { session } = results[0];
  return {
    id: session.id,
    requestId: session.requestId,
    managedSessionId: session.managedSessionId,
    role: session.role,
    step: session.step,
    status: session.status,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Verify session access by managed_session_id (for SSE stream route).
 * Checks: sessions -> requests -> repositories -> users chain.
 */
export async function verifySessionAccessByManagedId(
  managedSessionId: string
): Promise<SessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const results = await db
    .select({
      session: sessions,
      request: requests,
      repository: repositories,
    })
    .from(sessions)
    .innerJoin(requests, eq(sessions.requestId, requests.id))
    .innerJoin(repositories, eq(requests.repositoryId, repositories.id))
    .where(
      and(
        eq(sessions.managedSessionId, managedSessionId),
        eq(repositories.userId, user.dbId)
      )
    );

  if (results.length === 0) {
    throw new Error('Session not found');
  }

  const { session } = results[0];
  return {
    id: session.id,
    requestId: session.requestId,
    managedSessionId: session.managedSessionId,
    role: session.role,
    step: session.step,
    status: session.status,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function generateDefaultTitle(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `Session ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Create a Managed Agents session AND insert a sessions record.
 * Repo info is obtained from the request's repository.
 * Maintains rollback: if DB insert fails, the API session is archived.
 */
export async function createBoundSession(params: {
  requestId: number;
  role: 'implementer' | 'reviewer' | 'fixer' | 'explorer' | 'bootstrap';
  agentId: string;
  environmentId: string;
  title?: string;
}): Promise<SessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  // Verify request ownership and get repo info (also get user's vault_id)
  const requestResults = await db
    .select({
      request: requests,
      repository: repositories,
      userVaultId: users.vaultId,
    })
    .from(requests)
    .innerJoin(repositories, eq(requests.repositoryId, repositories.id))
    .innerJoin(users, eq(repositories.userId, users.id))
    .where(
      and(
        eq(requests.id, params.requestId),
        eq(repositories.userId, user.dbId)
      )
    );

  if (requestResults.length === 0) {
    throw new Error('Request not found');
  }

  const { repository, userVaultId } = requestResults[0];
  const repoUrl = `https://github.com/${repository.fullName}`;

  const client = getAnthropicClient();

  const resources: BetaManagedAgentsGitHubRepositoryResourceParams[] = [
    {
      type: 'github_repository',
      url: repoUrl,
      authorization_token: user.accessToken,
    },
  ];

  // Create the Managed Agents session first
  // Include vault_ids if user has a vault_id
  const apiSession = await client.beta.sessions.create({
    agent: params.agentId,
    environment_id: params.environmentId,
    resources,
    ...(userVaultId ? { vault_ids: [userVaultId] } : {}),
  });

  // Then insert the sessions record, with rollback on failure
  const title = params.title || generateDefaultTitle();

  let record;
  try {
    [record] = await db
      .insert(sessions)
      .values({
        requestId: params.requestId,
        managedSessionId: apiSession.id,
        role: params.role,
        status: 'active',
        title,
      })
      .returning();
  } catch (dbError) {
    // DB insert failed: archive the API session to prevent orphans
    console.error(
      `DB insert failed for session ${apiSession.id}, archiving API session to prevent orphan:`,
      dbError
    );
    try {
      await client.beta.sessions.archive(apiSession.id);
    } catch (archiveError) {
      console.error(
        `Failed to archive orphaned API session ${apiSession.id}:`,
        archiveError
      );
    }
    throw dbError;
  }

  revalidatePath(`/repos/${repository.owner}/${repository.name}`);

  return {
    id: record.id,
    requestId: record.requestId,
    managedSessionId: record.managedSessionId,
    role: record.role,
    step: record.step,
    status: record.status,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * List sessions for a specific request.
 * Verifies request ownership via verifyRequestOwnership (request-actions.ts).
 */
export async function listSessionsByRequest(
  requestId: number,
  options?: { limit?: number; offset?: number }
): Promise<SessionSummary[]> {
  // Delegates ownership check to the canonical verifyRequestOwnership
  await verifyRequestOwnership(requestId);

  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const results = await db
    .select()
    .from(sessions)
    .where(eq(sessions.requestId, requestId))
    .orderBy(desc(sessions.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map((s) => ({
    id: s.id,
    requestId: s.requestId,
    managedSessionId: s.managedSessionId,
    role: s.role,
    step: s.step,
    status: s.status,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Refresh session status from Managed Agents API and update cache.
 */
export async function refreshSessionStatus(
  sessionDbId: number
): Promise<SessionSummary> {
  // Verify access via chain
  const existing = await verifySessionAccess(sessionDbId);

  // Fetch current status from API
  const client = getAnthropicClient();
  const apiSession = await client.beta.sessions.retrieve(
    existing.managedSessionId
  );

  const newStatus = apiSession.archived_at ? 'archived' : apiSession.status;
  const mappedStatus = (['active', 'waiting', 'completed', 'archived'].includes(newStatus)
    ? newStatus
    : 'active') as 'active' | 'waiting' | 'completed' | 'archived';

  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({
      status: mappedStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionDbId))
    .returning();

  return {
    id: updated.id,
    requestId: updated.requestId,
    managedSessionId: updated.managedSessionId,
    role: updated.role,
    step: updated.step,
    status: updated.status,
    title: updated.title,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Archive a session via API and update sessions status.
 */
export async function archiveBoundSession(
  sessionDbId: number
): Promise<SessionSummary> {
  // Verify access via chain
  const existing = await verifySessionAccess(sessionDbId);

  // Archive via API
  const client = getAnthropicClient();
  await client.beta.sessions.archive(existing.managedSessionId);

  // Update local status
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({
      status: 'archived',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionDbId))
    .returning();

  // Get repo info for revalidation
  const repoResults = await db
    .select({ repository: repositories })
    .from(requests)
    .innerJoin(repositories, eq(requests.repositoryId, repositories.id))
    .where(eq(requests.id, existing.requestId));

  if (repoResults.length > 0) {
    const repo = repoResults[0].repository;
    revalidatePath(`/repos/${repo.owner}/${repo.name}`);
  }

  return {
    id: updated.id,
    requestId: updated.requestId,
    managedSessionId: updated.managedSessionId,
    role: updated.role,
    step: updated.step,
    status: updated.status,
    title: updated.title,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
