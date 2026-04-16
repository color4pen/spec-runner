'use server';

import { revalidatePath } from 'next/cache';
import { getAnthropicClient } from './anthropic';
import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { userSessions } from './db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { BetaManagedAgentsGitHubRepositoryResourceParams } from '@anthropic-ai/sdk/resources/beta/sessions/sessions';

export interface UserSessionSummary {
  id: number;
  userId: number;
  sessionId: string;
  repo: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Verify that the given Managed Agents sessionId belongs to the authenticated user.
 * Throws if the session is not found or not owned by the current user.
 * Returns the user_sessions record on success.
 */
export async function verifySessionOwnership(
  sessionId: string
): Promise<UserSessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionId, sessionId),
        eq(userSessions.userId, user.dbId)
      )
    );

  if (!existing) {
    throw new Error('Session not found');
  }

  return {
    id: existing.id,
    userId: existing.userId,
    sessionId: existing.sessionId,
    repo: existing.repo,
    title: existing.title,
    status: existing.status,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };
}

// Repo name validation: must be "owner/repo" format with safe characters
const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

function validateRepo(repo: string): void {
  if (!repo || !REPO_PATTERN.test(repo)) {
    throw new Error(
      `Invalid repository format: "${repo}". Expected "owner/repo" format with alphanumeric characters, dots, hyphens, and underscores only.`
    );
  }
}

function generateDefaultTitle(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `Session ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Create a Managed Agents session AND insert a user_sessions record.
 */
export async function createBoundSession(params: {
  agentId: string;
  environmentId: string;
  repo: string;
  title?: string;
}): Promise<UserSessionSummary> {
  const user = await getAuthenticatedUser();

  validateRepo(params.repo);

  const client = getAnthropicClient();
  const repoUrl = `https://github.com/${params.repo}`;

  const resources: BetaManagedAgentsGitHubRepositoryResourceParams[] = [
    {
      type: 'github_repository',
      url: repoUrl,
      authorization_token: user.accessToken,
    },
  ];

  // Create the Managed Agents session first
  const session = await client.beta.sessions.create({
    agent: params.agentId,
    environment_id: params.environmentId,
    resources,
  });

  // Then insert the user_sessions record, with rollback on failure
  const db = getDb();
  const title = params.title || generateDefaultTitle();

  let record;
  try {
    [record] = await db
      .insert(userSessions)
      .values({
        userId: user.dbId,
        sessionId: session.id,
        repo: params.repo,
        title,
        status: session.status,
      })
      .returning();
  } catch (dbError) {
    // DB insert failed: archive the API session to prevent orphans
    console.error(
      `DB insert failed for session ${session.id}, archiving API session to prevent orphan:`,
      dbError
    );
    try {
      await client.beta.sessions.archive(session.id);
    } catch (archiveError) {
      console.error(
        `Failed to archive orphaned API session ${session.id}:`,
        archiveError
      );
    }
    throw dbError;
  }

  revalidatePath(`/repos/${params.repo}`);

  return {
    id: record.id,
    userId: record.userId,
    sessionId: record.sessionId,
    repo: record.repo,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * List user sessions for a specific repository.
 */
export async function listUserSessions(
  repo: string
): Promise<UserSessionSummary[]> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const results = await db
    .select()
    .from(userSessions)
    .where(
      and(eq(userSessions.userId, user.dbId), eq(userSessions.repo, repo))
    )
    .orderBy(desc(userSessions.createdAt));

  return results.map((r) => ({
    id: r.id,
    userId: r.userId,
    sessionId: r.sessionId,
    repo: r.repo,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Refresh session status from Managed Agents API and update cache.
 */
export async function refreshSessionStatus(
  userSessionId: number
): Promise<UserSessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, userSessionId),
        eq(userSessions.userId, user.dbId)
      )
    );

  if (!existing) {
    throw new Error('Session not found');
  }

  // Fetch current status from API
  const client = getAnthropicClient();
  const apiSession = await client.beta.sessions.retrieve(existing.sessionId);

  const newStatus = apiSession.archived_at ? 'archived' : apiSession.status;

  // Update cache
  const [updated] = await db
    .update(userSessions)
    .set({
      status: newStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userSessions.id, userSessionId))
    .returning();

  return {
    id: updated.id,
    userId: updated.userId,
    sessionId: updated.sessionId,
    repo: updated.repo,
    title: updated.title,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Archive a session via API and update user_sessions status.
 */
export async function archiveBoundSession(
  userSessionId: number
): Promise<UserSessionSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, userSessionId),
        eq(userSessions.userId, user.dbId)
      )
    );

  if (!existing) {
    throw new Error('Session not found');
  }

  // Archive via API
  const client = getAnthropicClient();
  await client.beta.sessions.archive(existing.sessionId);

  // Update local status
  const [updated] = await db
    .update(userSessions)
    .set({
      status: 'archived',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userSessions.id, userSessionId))
    .returning();

  revalidatePath(`/repos/${existing.repo}`);

  return {
    id: updated.id,
    userId: updated.userId,
    sessionId: updated.sessionId,
    repo: updated.repo,
    title: updated.title,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
