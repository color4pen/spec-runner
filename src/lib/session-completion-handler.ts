// Session completion handler — no 'use server' directive.
// Pure lib module called from API Routes (SSE stream route).
// Uses direct DB queries — does NOT call Server Actions (which require auth() context).

import { getDb } from './db';
import { sessions, requests, repositories } from './db/schema';
import { eq, and } from 'drizzle-orm';
import {
  createPullRequest,
  closePullRequest,
  getBranchExists,
  findOpenPrByHead,
} from './github-api';

interface SessionContext {
  sessionId: number;
  managedSessionId: string;
  role: string;
  requestId: number;
  requestStatus: string;
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  bootstrapStatus: string;
  bootstrapPrUrl: string | null;
}

/**
 * Handle session completion event dispatched from SSE route.
 * Looks up the session by DB id, reads its role, and dispatches to the appropriate handler.
 *
 * @param sessionDbId - The DB id of the completed session
 * @param accessToken - The OAuth token of the session owner (from SSE route's auth())
 */
export async function handleSessionCompleted(
  sessionDbId: number,
  accessToken: string
): Promise<void> {
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
    .where(eq(sessions.id, sessionDbId));

  if (results.length === 0) {
    throw new Error(`Session not found: ${sessionDbId}`);
  }

  const { session, request, repository } = results[0];
  const ctx: SessionContext = {
    sessionId: session.id,
    managedSessionId: session.managedSessionId,
    role: session.role,
    requestId: request.id,
    requestStatus: request.status,
    repositoryId: repository.id,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    bootstrapStatus: repository.bootstrapStatus,
    bootstrapPrUrl: repository.bootstrapPrUrl,
  };

  switch (ctx.role) {
    case 'bootstrap':
      return handleBootstrapCompleted(ctx, accessToken);
    default:
      // For other roles: mark session as completed
      return handleDefaultCompleted(ctx);
  }
}

/**
 * Default completion handler: update session status to 'completed'.
 */
async function handleDefaultCompleted(ctx: SessionContext): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ status: 'completed', updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, ctx.sessionId));
}

/**
 * Bootstrap completion handler.
 *
 * Flow:
 * 1. Update session status to 'completed'
 * 2. Check if branch openspec-bootstrap/{owner}/{repo} exists
 * 3a. Branch exists: create PR (or find existing) → save bootstrap_pr_url → pr_pending → request reviewing
 * 3b. Branch absent: rollback to uninitialized → request cancelled
 */
async function handleBootstrapCompleted(
  ctx: SessionContext,
  accessToken: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Step 1: Mark session as completed
  await db
    .update(sessions)
    .set({ status: 'completed', updatedAt: now })
    .where(eq(sessions.id, ctx.sessionId));

  const branchName = `openspec-bootstrap/${ctx.owner}/${ctx.name}`;

  // Step 2: Check branch existence
  const branchExists = await getBranchExists(
    accessToken,
    ctx.owner,
    ctx.name,
    branchName
  );

  if (!branchExists) {
    // Step 3b: Rollback — branch not found
    await db
      .update(repositories)
      .set({ bootstrapStatus: 'uninitialized' })
      .where(eq(repositories.id, ctx.repositoryId));
    await db
      .update(requests)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(requests.id, ctx.requestId));
    return;
  }

  // Step 3a: Branch exists — check for existing open PR (idempotency)
  let pr = await findOpenPrByHead(
    accessToken,
    ctx.owner,
    ctx.name,
    branchName
  );

  if (!pr) {
    // No existing PR — create one
    const defaultBase = ctx.defaultBranch ?? 'main';
    try {
      pr = await createPullRequest(accessToken, ctx.owner, ctx.name, {
        head: branchName,
        base: defaultBase,
        title: 'Bootstrap openspec-workflow',
        body: 'Initialize openspec-workflow directory structure, configuration, and review standards.',
      });
    } catch (createError) {
      // PR creation failed — rollback
      await db
        .update(repositories)
        .set({ bootstrapStatus: 'uninitialized' })
        .where(eq(repositories.id, ctx.repositoryId));
      await db
        .update(requests)
        .set({ status: 'cancelled', updatedAt: now })
        .where(eq(requests.id, ctx.requestId));
      throw createError;
    }
  }

  // Step 4: Save PR URL and update statuses
  try {
    await db
      .update(repositories)
      .set({
        bootstrapStatus: 'pr_pending',
        bootstrapPrUrl: pr.html_url,
      })
      .where(
        and(
          eq(repositories.id, ctx.repositoryId),
          eq(repositories.bootstrapStatus, 'bootstrapping')
        )
      );

    await db
      .update(requests)
      .set({ status: 'reviewing', updatedAt: now })
      .where(eq(requests.id, ctx.requestId));
  } catch (dbError) {
    // DB update failed after PR was created — close PR as best-effort cleanup
    try {
      await closePullRequest(accessToken, ctx.owner, ctx.name, pr.number);
    } catch {
      // Best-effort: ignore close errors
    }
    throw dbError;
  }
}
