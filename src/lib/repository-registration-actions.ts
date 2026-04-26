'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories } from './db/schema';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import type { BootstrapStatus } from './bootstrap-utils';
import { getFileContent, getDirectoryContents } from './github-api';

// Valid owner/name pattern: alphanumeric, dots, hyphens, underscores
const REPO_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export interface GitHubSearchResult {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  language: string | null;
  private: boolean;
  alreadyRegistered: boolean;
}

export interface RepositoryWithStatus {
  id: number;
  userId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  bootstrapStatus: BootstrapStatus;
  bootstrapPrUrl: string | null;
  createdAt: string;
  requestCount: number;
}

/** Inline subquery for counting requests per repository. */
const requestCountSubquery = sql<number>`(SELECT count(*) FROM requests WHERE requests.repository_id = repositories.id)`;

/**
 * Detect whether a repository has already been bootstrapped with openspec-workflow.
 * Checks for the presence of `openspec/project.md` and `requests/active/` on the default branch.
 * Returns `'ready'` if both exist, `'uninitialized'` otherwise.
 * On any API error, falls back to `'uninitialized'` (safe fallback — never re-throws).
 */
async function detectBootstrapStatus(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<BootstrapStatus> {
  try {
    const [projectFile, activeDir] = await Promise.all([
      getFileContent(token, owner, repo, 'openspec/project.md', defaultBranch),
      getDirectoryContents(token, owner, repo, 'requests/active/', defaultBranch),
    ]);
    const isReady = projectFile !== null && activeDir.length > 0;
    return isReady ? 'ready' : 'uninitialized';
  } catch {
    return 'uninitialized';
  }
}

/**
 * Fetch all GitHub repositories accessible to the authenticated user.
 * Returns results with alreadyRegistered flag for display in the registration dialog.
 */
export async function listGitHubReposForRegistration(): Promise<GitHubSearchResult[]> {
  const user = await getAuthenticatedUser();

  const items: Array<{
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    description: string | null;
    language: string | null;
    private: boolean;
  }> = [];

  let page = 1;
  const perPage = 100;
  const maxPages = 5;

  while (page <= maxPages) {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data.map((repo: Record<string, unknown>) => ({
      id: repo.id as number,
      name: repo.name as string,
      full_name: repo.full_name as string,
      owner: repo.owner as { login: string },
      description: repo.description as string | null,
      language: repo.language as string | null,
      private: repo.private as boolean,
    })));
    if (data.length < perPage) break;
    page++;
  }

  // Check which repos are already registered in DB
  const db = getDb();
  const fullNames = items.map((r) => r.full_name);

  let registeredSet = new Set<string>();
  if (fullNames.length > 0) {
    const registered = await db
      .select({ fullName: repositories.fullName })
      .from(repositories)
      .where(
        and(
          eq(repositories.userId, user.dbId),
          inArray(repositories.fullName, fullNames)
        )
      );
    registeredSet = new Set(registered.map((r) => r.fullName));
  }

  return items.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    language: repo.language,
    private: repo.private,
    alreadyRegistered: registeredSet.has(repo.full_name),
  }));
}

/**
 * Register a repository for the authenticated user.
 * Verifies access via GitHub API, validates owner/name pattern,
 * inserts into repositories with bootstrap_status: 'uninitialized'.
 * Handles 404/403 uniformly and duplicate registration errors.
 */
export async function registerRepository(
  owner: string,
  name: string
): Promise<RepositoryWithStatus> {
  // Validate owner/name pattern
  if (!REPO_NAME_PATTERN.test(owner)) {
    throw new Error(`Invalid owner: "${owner}". Must contain only alphanumeric characters, dots, hyphens, or underscores.`);
  }
  if (!REPO_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid repository name: "${name}". Must contain only alphanumeric characters, dots, hyphens, or underscores.`);
  }

  const user = await getAuthenticatedUser();
  const fullName = `${owner}/${name}`;

  // Verify access via GitHub API
  const response = await fetch(
    `https://api.github.com/repos/${fullName}`,
    {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      throw new Error(
        `Repository "${fullName}" not found or not accessible. Please verify you have access.`
      );
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const ghRepo = await response.json() as { default_branch: string };
  const db = getDb();

  const bootstrapStatus = await detectBootstrapStatus(
    user.accessToken,
    owner,
    name,
    ghRepo.default_branch || 'main'
  );

  // Check for duplicate
  const [existing] = await db
    .select({
      id: repositories.id,
      userId: repositories.userId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      bootstrapStatus: repositories.bootstrapStatus,
      bootstrapPrUrl: repositories.bootstrapPrUrl,
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
    throw new Error(
      `Repository "${fullName}" is already registered.`
    );
  }

  // Insert with dynamically detected bootstrap_status
  const [record] = await db
    .insert(repositories)
    .values({
      userId: user.dbId,
      owner,
      name,
      fullName,
      defaultBranch: ghRepo.default_branch || null,
      bootstrapStatus,
    })
    .returning();

  return {
    id: record.id,
    userId: record.userId,
    owner: record.owner,
    name: record.name,
    fullName: record.fullName,
    defaultBranch: record.defaultBranch,
    bootstrapStatus: record.bootstrapStatus as BootstrapStatus,
    bootstrapPrUrl: record.bootstrapPrUrl,
    createdAt: record.createdAt,
    requestCount: 0,
  };
}

/**
 * List repositories for the authenticated user with request counts and bootstrap status.
 * Uses a single query with an inline count subquery to avoid N+1.
 */
export async function listUserRepositories(options?: {
  limit?: number;
  offset?: number;
}): Promise<RepositoryWithStatus[]> {
  const user = await getAuthenticatedUser();
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const results = await db
    .select({
      id: repositories.id,
      userId: repositories.userId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      bootstrapStatus: repositories.bootstrapStatus,
      bootstrapPrUrl: repositories.bootstrapPrUrl,
      createdAt: repositories.createdAt,
      requestCount: requestCountSubquery,
    })
    .from(repositories)
    .where(eq(repositories.userId, user.dbId))
    .orderBy(desc(repositories.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map((r) => ({
    id: r.id,
    userId: r.userId,
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch,
    bootstrapStatus: r.bootstrapStatus as BootstrapStatus,
    bootstrapPrUrl: r.bootstrapPrUrl,
    createdAt: r.createdAt,
    requestCount: r.requestCount,
  }));
}
