'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories, requests, sessions } from './db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { VALID_ENABLED_OPTIONS } from './propose-utils';

const VALID_TYPES = ['new-feature', 'spec-change', 'refactoring', 'bugfix', 'bootstrap'] as const;
const VALID_STATUSES = ['draft', 'in-progress', 'reviewing', 'completed', 'cancelled'] as const;

type RequestType = (typeof VALID_TYPES)[number];
type RequestStatus = (typeof VALID_STATUSES)[number];

// Allowed state transitions map
const ALLOWED_TRANSITIONS: Record<string, RequestStatus[]> = {
  draft: ['in-progress', 'cancelled'],
  'in-progress': ['reviewing', 'cancelled'],
  reviewing: ['completed', 'in-progress', 'cancelled'],
  completed: [], // terminal
  cancelled: [], // terminal
};

export interface RequestSummary {
  id: number;
  repositoryId: number;
  type: string;
  status: string;
  title: string;
  content: string | null;
  enabled: string | null;
  branchName: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface RequestDetail extends RequestSummary {
  sessions: SessionSummary[];
}

/**
 * Verify that the given request belongs to the authenticated user.
 * Checks: requests -> repositories -> users chain.
 * Throws if not found or not owned.
 */
export async function verifyRequestOwnership(
  requestId: number
): Promise<RequestSummary> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const results = await db
    .select({
      request: requests,
      repository: repositories,
    })
    .from(requests)
    .innerJoin(repositories, eq(requests.repositoryId, repositories.id))
    .where(
      and(
        eq(requests.id, requestId),
        eq(repositories.userId, user.dbId)
      )
    );

  if (results.length === 0) {
    throw new Error('Request not found');
  }

  const { request } = results[0];
  return {
    id: request.id,
    repositoryId: request.repositoryId,
    type: request.type,
    status: request.status,
    title: request.title,
    content: request.content,
    enabled: request.enabled ?? null,
    branchName: request.branchName ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

/**
 * Verify that a repository belongs to the authenticated user.
 * Throws if not found or not owned.
 */
async function verifyRepositoryOwnership(repositoryId: number) {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(
        eq(repositories.id, repositoryId),
        eq(repositories.userId, user.dbId)
      )
    );

  if (!repo) {
    throw new Error('Repository not found');
  }

  return repo;
}

/**
 * Create a new request for a repository.
 * Validates type and enabled values, verifies repository ownership, and checks bootstrap_status === 'ready'.
 */
export async function createRequest(params: {
  repositoryId: number;
  type: string;
  title: string;
  content: string | null;
  enabled?: string[];
}): Promise<RequestSummary> {
  const { repositoryId, type, title, content, enabled } = params;

  // Validate type
  if (!VALID_TYPES.includes(type as RequestType)) {
    throw new Error(
      `Invalid request type: "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
    );
  }

  // Validate enabled values
  if (enabled !== undefined && enabled.length > 0) {
    const invalidOptions = enabled.filter(
      (opt) => !VALID_ENABLED_OPTIONS.includes(opt as (typeof VALID_ENABLED_OPTIONS)[number])
    );
    if (invalidOptions.length > 0) {
      throw new Error(
        `Invalid enabled options: ${invalidOptions.join(', ')}. Must be one of: ${VALID_ENABLED_OPTIONS.join(', ')}`
      );
    }
  }

  // Verify repository ownership and get bootstrap status
  const repo = await verifyRepositoryOwnership(repositoryId);

  // Guard: reject if repository is not ready
  if (repo.bootstrapStatus !== 'ready') {
    throw new Error(
      'Repository is not ready. Bootstrap must be completed first.'
    );
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Serialize enabled to JSON string, or null if not provided/empty
  const enabledJson =
    enabled !== undefined && enabled.length > 0
      ? JSON.stringify(enabled)
      : null;

  const [record] = await db
    .insert(requests)
    .values({
      repositoryId,
      type: type as RequestType,
      title,
      content,
      enabled: enabledJson,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    id: record.id,
    repositoryId: record.repositoryId,
    type: record.type,
    status: record.status,
    title: record.title,
    content: record.content,
    enabled: record.enabled ?? null,
    branchName: record.branchName ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * List requests for a repository.
 * Verifies repository ownership, sorted by created_at DESC.
 */
export async function listRequests(
  repositoryId: number,
  options?: { limit?: number; offset?: number }
): Promise<RequestSummary[]> {
  // Verify repository ownership
  await verifyRepositoryOwnership(repositoryId);

  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const results = await db
    .select()
    .from(requests)
    .where(eq(requests.repositoryId, repositoryId))
    .orderBy(desc(requests.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map((r) => ({
    id: r.id,
    repositoryId: r.repositoryId,
    type: r.type,
    status: r.status,
    title: r.title,
    content: r.content,
    enabled: r.enabled ?? null,
    branchName: r.branchName ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Get request details including related sessions.
 * Verifies ownership.
 */
export async function getRequestDetail(
  requestId: number
): Promise<RequestDetail> {
  const request = await verifyRequestOwnership(requestId);

  const db = getDb();
  const sessionResults = await db
    .select()
    .from(sessions)
    .where(eq(sessions.requestId, requestId))
    .orderBy(desc(sessions.createdAt));

  return {
    ...request,
    sessions: sessionResults.map((s) => ({
      id: s.id,
      requestId: s.requestId,
      managedSessionId: s.managedSessionId,
      role: s.role,
      step: s.step,
      status: s.status,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

/**
 * Update request status with transition validation.
 * Allowed transitions:
 *   draft -> in-progress | cancelled
 *   in-progress -> reviewing | cancelled
 *   reviewing -> completed | in-progress
 *   completed -> (terminal)
 *   cancelled -> (terminal)
 */
export async function updateRequestStatus(
  requestId: number,
  newStatus: string
): Promise<RequestSummary> {
  // Validate the new status value
  if (!VALID_STATUSES.includes(newStatus as RequestStatus)) {
    throw new Error(
      `Invalid status: "${newStatus}". Must be one of: ${VALID_STATUSES.join(', ')}`
    );
  }

  // Verify ownership and get current state
  const current = await verifyRequestOwnership(requestId);

  // Check transition validity
  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed || allowed.length === 0) {
    throw new Error(
      `Cannot transition from terminal status "${current.status}"`
    );
  }

  if (!allowed.includes(newStatus as RequestStatus)) {
    throw new Error(
      `Invalid status transition: "${current.status}" -> "${newStatus}". Allowed: ${allowed.join(', ')}`
    );
  }

  const db = getDb();
  const now = new Date().toISOString();

  const [updated] = await db
    .update(requests)
    .set({
      status: newStatus as RequestStatus,
      updatedAt: now,
    })
    .where(eq(requests.id, requestId))
    .returning();

  return {
    id: updated.id,
    repositoryId: updated.repositoryId,
    type: updated.type,
    status: updated.status,
    title: updated.title,
    content: updated.content,
    enabled: updated.enabled ?? null,
    branchName: updated.branchName ?? null,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
