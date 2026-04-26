'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { requests, repositories, sessions } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { createBoundSession } from './session-actions';
import { sendMessage } from './actions';
import { revalidatePath } from 'next/cache';
import { ensureVaultWithCredentials } from './vault-actions';
import { getDirectoryContents, getFileContent } from './github-api';
import type { DirectoryEntry } from './github-api';
import {
  generateSlug,
  generateBranchName,
  extractSlugFromBranchName,
  buildProposeMessage,
  parseEnabledJson,
} from './propose-utils';
import { REGISTER_BRANCH_TOOL } from './register-branch-tool';

/**
 * Shared helper: verify request ownership and return request + repository.
 * Throws 'Request not found' if the request does not belong to the authenticated user.
 */
async function verifyRequestWithRepository(
  requestId: number,
  userId: number
): Promise<{ request: typeof requests.$inferSelect; repository: typeof repositories.$inferSelect }> {
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
        eq(repositories.userId, userId)
      )
    );

  if (results.length === 0) {
    throw new Error('Request not found');
  }

  return results[0];
}

/**
 * Start a propose session for a request.
 * Flow: verify ownership + draft status -> transition to in-progress -> Vault setup
 *       -> createBoundSession(role: 'propose') -> sendMessage
 * On failure: rollback request status to draft, cancel session if partially created.
 *
 * Slug generation is delegated to the agent. The agent will call register_branch
 * Custom Tool to report slug + branch_name back to spec-runner.
 */
export async function startPropose(
  requestId: number,
  agentId: string,
  environmentId: string
): Promise<{ sessionId: number; managedSessionId: string }> {
  const user = await getAuthenticatedUser();

  const { request, repository } = await verifyRequestWithRepository(requestId, user.dbId);

  // Guard: must be draft status
  if (request.status !== 'draft') {
    throw new Error(
      `Cannot start propose when request status is "${request.status}". Must be "draft".`
    );
  }

  // Step 1: Transition request to in-progress
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(requests)
    .set({ status: 'in-progress', updatedAt: now })
    .where(eq(requests.id, requestId))
    .run();

  let sessionId: number | undefined;

  try {
    // Step 2: Ensure Vault is set up with MCP credentials
    await ensureVaultWithCredentials(user.dbId, user.accessToken);

    // Step 3: Create bound session (role: 'propose') with register_branch Custom Tool
    // Note: The Anthropic SDK SessionCreateParams does not currently support a 'tools'
    // parameter at the session level — tools must be registered on the Agent.
    // The REGISTER_BRANCH_TOOL is passed here for documentation and future SDK support.
    const session = await createBoundSession({
      requestId,
      role: 'propose',
      agentId,
      environmentId,
      title: `Propose: ${request.title}`,
      customTools: [REGISTER_BRANCH_TOOL],
    });
    sessionId = session.id;

    // Step 4: Build and send propose instruction message
    // Slug generation is delegated to the agent (no server-side slug pre-computation)
    const enabledOptions = parseEnabledJson(request.enabled);
    const message = buildProposeMessage({
      requestId,
      requestTitle: request.title,
      requestContent: request.content,
      requestType: request.type,
      enabled: enabledOptions,
    });
    await sendMessage(session.managedSessionId, message);

    revalidatePath(`/repos/${repository.owner}/${repository.name}`);

    return {
      sessionId: session.id,
      managedSessionId: session.managedSessionId,
    };
  } catch (error) {
    // Rollback: revert request to draft
    try {
      await db
        .update(requests)
        .set({ status: 'draft', updatedAt: new Date().toISOString() })
        .where(eq(requests.id, requestId))
        .run();
    } catch {
      // Best-effort cleanup — ignore secondary errors
    }

    // Rollback: archive the session if it was created before the failure
    if (sessionId !== undefined) {
      try {
        await db
          .update(sessions)
          .set({ status: 'archived', updatedAt: new Date().toISOString() })
          .where(eq(sessions.id, sessionId))
          .run();
      } catch {
        // Best-effort cleanup — ignore secondary errors
      }
    }

    throw error;
  }
}

/**
 * Resolve slug and branch name for a request.
 * Uses DB branch_name when available; falls back to deterministic derivation.
 */
function resolveSlugAndBranch(request: typeof requests.$inferSelect): {
  slug: string;
  branchName: string;
} {
  if (request.branchName) {
    const slug = extractSlugFromBranchName(request.branchName);
    if (slug) {
      return { slug, branchName: request.branchName };
    }
  }
  // Fallback: deterministic derivation from createdAt + title
  const createdDate = request.createdAt.slice(0, 10);
  const slug = generateSlug(createdDate, request.title);
  const branchName = generateBranchName(request.type, slug);
  return { slug, branchName };
}

/**
 * Server Action: Get the list of files in the change folder for a request.
 * Uses DB branch_name when available; falls back to deterministic derivation.
 */
export async function getChangeFolderFiles(
  requestId: number
): Promise<DirectoryEntry[]> {
  const user = await getAuthenticatedUser();

  const { request, repository } = await verifyRequestWithRepository(requestId, user.dbId);

  const { slug, branchName } = resolveSlugAndBranch(request);
  const changeFolderPath = `openspec/changes/${slug}`;

  return getDirectoryContents(
    user.accessToken,
    repository.owner,
    repository.name,
    changeFolderPath,
    branchName
  );
}

/**
 * Server Action: Get the contents of a subdirectory within the change folder.
 * Calls getDirectoryContents() for the specified dirPath on the request's branch.
 * Validates that dirPath is within the change folder to prevent path traversal.
 */
export async function getChangeFolderDirectoryContents(
  requestId: number,
  dirPath: string
): Promise<DirectoryEntry[]> {
  const user = await getAuthenticatedUser();

  const { request, repository } = await verifyRequestWithRepository(requestId, user.dbId);

  const createdDate = request.createdAt.slice(0, 10);
  const slug = generateSlug(createdDate, request.title);
  const branchName = generateBranchName(request.type, slug);
  const changeFolderPath = `openspec/changes/${slug}`;

  // Guard against path traversal: dirPath must be within the change folder
  if (dirPath.includes('..') || !dirPath.startsWith(changeFolderPath)) {
    throw new Error('Invalid directory path: must be within the change folder');
  }

  return getDirectoryContents(
    user.accessToken,
    repository.owner,
    repository.name,
    dirPath,
    branchName
  );
}

/**
 * Server Action: Get the content of a specific file in the change folder.
 * Uses DB branch_name when available; falls back to deterministic derivation.
 * Validates that filePath is within the change folder to prevent path traversal.
 */
export async function getChangeFolderFileContent(
  requestId: number,
  filePath: string
): Promise<string | null> {
  const user = await getAuthenticatedUser();

  const { request, repository } = await verifyRequestWithRepository(requestId, user.dbId);

  const { branchName } = resolveSlugAndBranch(request);

  // Guard against path traversal: filePath must be within openspec/changes/
  // and must not contain '..' segments.
  if (filePath.includes('..') || !filePath.startsWith('openspec/changes/')) {
    throw new Error('Invalid file path: must be within the change folder');
  }

  return getFileContent(
    user.accessToken,
    repository.owner,
    repository.name,
    filePath,
    branchName
  );
}
