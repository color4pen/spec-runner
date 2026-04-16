'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories } from './db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface RepositorySummary {
  id: number;
  userId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  createdAt: string;
  requestCount: number;
}

/** Subquery expression for counting requests per repository. */
const requestCountSubquery = sql<number>`(SELECT count(*) FROM requests WHERE requests.repository_id = repositories.id)`;

/**
 * Get or create a repository record after verifying GitHub API access.
 * Uses the authenticated user's OAuth token to check repo access via GitHub API.
 * Throws if the user does not have access to the repository.
 */
export async function getOrCreateRepository(
  owner: string,
  name: string
): Promise<RepositorySummary> {
  const user = await getAuthenticatedUser();
  const fullName = `${owner}/${name}`;
  const db = getDb();

  // Verify access via GitHub API
  const ghResponse = await fetch(
    `https://api.github.com/repos/${fullName}`,
    {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!ghResponse.ok) {
    throw new Error('Repository not found or not accessible');
  }

  const ghRepo = await ghResponse.json();

  // UPSERT: try to find existing, create if not found (with inline count)
  const [existing] = await db
    .select({
      id: repositories.id,
      userId: repositories.userId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      createdAt: repositories.createdAt,
      requestCount: requestCountSubquery,
    })
    .from(repositories)
    .where(
      and(
        eq(repositories.userId, user.dbId),
        eq(repositories.fullName, fullName)
      )
    );

  if (existing) {
    return existing;
  }

  // Create new repository
  const [record] = await db
    .insert(repositories)
    .values({
      userId: user.dbId,
      owner,
      name,
      fullName,
      defaultBranch: ghRepo.default_branch || null,
    })
    .returning();

  return {
    id: record.id,
    userId: record.userId,
    owner: record.owner,
    name: record.name,
    fullName: record.fullName,
    defaultBranch: record.defaultBranch,
    createdAt: record.createdAt,
    requestCount: 0,
  };
}

/**
 * List repositories for the authenticated user with request counts.
 * Uses a single query with an inline count subquery to avoid N+1.
 */
export async function listUserRepositories(options?: {
  limit?: number;
  offset?: number;
}): Promise<RepositorySummary[]> {
  const user = await getAuthenticatedUser();
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  return db
    .select({
      id: repositories.id,
      userId: repositories.userId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      createdAt: repositories.createdAt,
      requestCount: requestCountSubquery,
    })
    .from(repositories)
    .where(eq(repositories.userId, user.dbId))
    .limit(limit)
    .offset(offset);
}
