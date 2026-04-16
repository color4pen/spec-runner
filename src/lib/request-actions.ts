'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories, requests, sessions } from './db/schema';
import { eq, and, desc } from 'drizzle-orm';

const VALID_TYPES = ['new-feature', 'spec-change', 'refactoring', 'bugfix'] as const;
const VALID_STATUSES = ['draft', 'in-progress', 'reviewing', 'completed', 'cancelled'] as const;

type RequestType = (typeof VALID_TYPES)[number];
type RequestStatus = (typeof VALID_STATUSES)[number];

// Allowed state transitions map
const ALLOWED_TRANSITIONS: Record<string, RequestStatus[]> = {
  draft: ['in-progress', 'cancelled'],
  'in-progress': ['reviewing', 'cancelled'],
  reviewing: ['completed', 'in-progress'],
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
 * Validates type and verifies repository ownership.
 */
export async function createRequest(
  repositoryId: number,
  type: string,
  title: string,
  content: string | null
): Promise<RequestSummary> {
  // Validate type
  if (!VALID_TYPES.includes(type as RequestType)) {
    throw new Error(
      `Invalid request type: "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
    );
  }

  // Verify repository ownership
  await verifyRepositoryOwnership(repositoryId);

  const db = getDb();
  const now = new Date().toISOString();

  const [record] = await db
    .insert(requests)
    .values({
      repositoryId,
      type: type as RequestType,
      title,
      content,
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
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
