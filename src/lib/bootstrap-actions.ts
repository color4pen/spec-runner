'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories, requests, sessions } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { updateRequestStatus } from './request-actions';
import { createBoundSession } from './session-actions';
import { sendMessage } from './actions';
import { revalidatePath } from 'next/cache';
import {
  type BootstrapStatus,
  ALLOWED_BOOTSTRAP_TRANSITIONS,
  validateBootstrapTransition,
  isValidPrUrl,
  extractPrUrl,
} from './bootstrap-utils';

export interface RepositoryWithBootstrap {
  id: number;
  userId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  bootstrapStatus: BootstrapStatus;
  bootstrapPrUrl: string | null;
  createdAt: string;
}

/**
 * Get repository with bootstrap status, verifying ownership.
 * Throws if not found or not owned by authenticated user.
 */
export async function getRepositoryWithBootstrapStatus(
  repositoryId: number
): Promise<RepositoryWithBootstrap> {
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

  return {
    id: repo.id,
    userId: repo.userId,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    bootstrapStatus: repo.bootstrapStatus as BootstrapStatus,
    bootstrapPrUrl: repo.bootstrapPrUrl,
    createdAt: repo.createdAt,
  };
}

/**
 * Update bootstrap status with transition validation.
 * Verifies repository ownership via getAuthenticatedUser() internally.
 * When transitioning pr_pending -> uninitialized, clears bootstrap_pr_url.
 */
export async function updateBootstrapStatus(
  repositoryId: number,
  newStatus: BootstrapStatus
): Promise<RepositoryWithBootstrap> {
  const repo = await getRepositoryWithBootstrapStatus(repositoryId);
  const currentStatus = repo.bootstrapStatus;

  if (!validateBootstrapTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid bootstrap status transition: "${currentStatus}" -> "${newStatus}". Allowed from "${currentStatus}": ${ALLOWED_BOOTSTRAP_TRANSITIONS[currentStatus].join(', ') || 'none'}`
    );
  }

  const db = getDb();

  // Clear bootstrap_pr_url when transitioning from pr_pending -> uninitialized
  const clearPrUrl = currentStatus === 'pr_pending' && newStatus === 'uninitialized';

  const [updated] = await db
    .update(repositories)
    .set({
      bootstrapStatus: newStatus,
      ...(clearPrUrl ? { bootstrapPrUrl: null } : {}),
    })
    .where(eq(repositories.id, repositoryId))
    .returning();

  revalidatePath(`/repos/${updated.owner}/${updated.name}`);

  return {
    id: updated.id,
    userId: updated.userId,
    owner: updated.owner,
    name: updated.name,
    fullName: updated.fullName,
    defaultBranch: updated.defaultBranch,
    bootstrapStatus: updated.bootstrapStatus as BootstrapStatus,
    bootstrapPrUrl: updated.bootstrapPrUrl,
    createdAt: updated.createdAt,
  };
}

/**
 * Set bootstrap PR URL and transition to pr_pending.
 * Validates PR URL format. Only callable when bootstrapStatus === 'bootstrapping'.
 */
export async function setBootstrapPrUrl(
  repositoryId: number,
  prUrl: string
): Promise<RepositoryWithBootstrap> {
  if (!isValidPrUrl(prUrl)) {
    throw new Error(
      `Invalid PR URL format: "${prUrl}". Expected: https://github.com/{owner}/{repo}/pull/{number}`
    );
  }

  const repo = await getRepositoryWithBootstrapStatus(repositoryId);

  if (repo.bootstrapStatus !== 'bootstrapping') {
    throw new Error(
      `Cannot set PR URL when bootstrap status is "${repo.bootstrapStatus}". Must be "bootstrapping".`
    );
  }

  const db = getDb();

  const [updated] = await db
    .update(repositories)
    .set({
      bootstrapStatus: 'pr_pending',
      bootstrapPrUrl: prUrl,
    })
    .where(eq(repositories.id, repositoryId))
    .returning();

  revalidatePath(`/repos/${updated.owner}/${updated.name}`);

  return {
    id: updated.id,
    userId: updated.userId,
    owner: updated.owner,
    name: updated.name,
    fullName: updated.fullName,
    defaultBranch: updated.defaultBranch,
    bootstrapStatus: updated.bootstrapStatus as BootstrapStatus,
    bootstrapPrUrl: updated.bootstrapPrUrl,
    createdAt: updated.createdAt,
  };
}

/**
 * Build the bootstrap instruction message sent to the managed agent.
 */
function buildBootstrapMessage(owner: string, repoName: string): string {
  return `You are tasked with bootstrapping the openspec-workflow for the repository ${owner}/${repoName}.

Please perform the following steps in order:

1. **Run openspec init**: Execute \`npx @fission-ai/openspec init\` to initialize the openspec-workflow configuration.

2. **Create directory structure**: Ensure the following directories exist:
   - \`openspec/specs/\`
   - \`openspec/changes/\`
   - \`requests/active/\`
   - \`requests/done/\`
   - \`docs/\`

3. **Tech stack reconnaissance**: Read and analyze:
   - \`package.json\` (or \`Cargo.toml\`, \`go.mod\`, etc.) to identify the technology stack
   - \`tsconfig.json\` if present
   - README.md if present
   - List the main source directories

4. **Detect verification commands**: Identify the build, test, and lint commands from package.json scripts or equivalent. Document them in \`docs/verification-commands.md\`.

5. **Place review-standards**: Create or copy the review standards file at \`.claude/rules/review-standards.md\`. Use the standard openspec-workflow review standards content.

6. **Commit and create PR**: Stage all created/modified files, create a commit with message "bootstrap: initialize openspec-workflow", then create a pull request using:
   \`\`\`
   gh pr create --title "Bootstrap openspec-workflow" --body "Initialize openspec-workflow directory structure, configuration, and review standards."
   \`\`\`

7. **Report completion**: After creating the PR, output the PR URL so it can be tracked.

Note: Skip hooks-related setup (Step 5 and 6 of the CLI bootstrap) as this is a managed agent environment.
Do not ask for confirmation — proceed autonomously through all steps.`;
}

/**
 * Start bootstrap for a repository.
 * Atomic flow: update status -> create request -> transition request -> create session -> send message.
 * Rolls back on any step failure.
 * Guards: must be uninitialized, must be owned by authenticated user.
 */
export async function startBootstrap(
  repositoryId: number,
  agentId: string,
  environmentId: string
): Promise<{ requestId: number; sessionId: number; managedSessionId: string }> {
  const repo = await getRepositoryWithBootstrapStatus(repositoryId);

  if (repo.bootstrapStatus !== 'uninitialized') {
    throw new Error(
      `Cannot start bootstrap when repository status is "${repo.bootstrapStatus}". Must be "uninitialized".`
    );
  }

  const db = getDb();

  // Step 1: Transition to bootstrapping
  await db
    .update(repositories)
    .set({ bootstrapStatus: 'bootstrapping' })
    .where(eq(repositories.id, repositoryId))
    .run();

  let requestId: number | null = null;

  try {
    // Step 2: Create bootstrap request (draft) — bypass createRequest guard via direct DB insert
    // startBootstrap runs while bootstrapStatus === 'bootstrapping', so createRequest guard would reject it.
    const now = new Date().toISOString();
    const [bootstrapRequest] = await db
      .insert(requests)
      .values({
        repositoryId,
        type: 'new-feature',
        title: 'Bootstrap openspec-workflow',
        content: 'Automated bootstrap of openspec-workflow via managed agent session.',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    requestId = bootstrapRequest.id;

    // Step 3: Transition request from draft -> in-progress
    await updateRequestStatus(bootstrapRequest.id, 'in-progress');

    // Step 4: Create bound session (role: implementer)
    const session = await createBoundSession({
      requestId: bootstrapRequest.id,
      role: 'implementer',
      agentId,
      environmentId,
      title: `Bootstrap ${repo.fullName}`,
    });

    // Step 5: Send bootstrap instruction message
    const message = buildBootstrapMessage(repo.owner, repo.name);
    await sendMessage(session.managedSessionId, message);

    revalidatePath(`/repos/${repo.owner}/${repo.name}`);

    return {
      requestId: bootstrapRequest.id,
      sessionId: session.id,
      managedSessionId: session.managedSessionId,
    };
  } catch (error) {
    // Rollback: revert repository to uninitialized
    await db
      .update(repositories)
      .set({ bootstrapStatus: 'uninitialized' })
      .where(eq(repositories.id, repositoryId))
      .run();

    // If request was created, try to cancel it
    if (requestId !== null) {
      try {
        await db
          .update(requests)
          .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
          .where(eq(requests.id, requestId))
          .run();
      } catch {
        // Best-effort cleanup — ignore secondary errors
      }
    }

    throw error;
  }
}

/**
 * Sync bootstrap PR status by calling GitHub API.
 * - PR merged -> ready
 * - PR closed (not merged) -> uninitialized + clear pr_url
 * - PR open -> no change
 * - API error -> retain current status, throw error
 */
export async function syncBootstrapPrStatus(
  repositoryId: number
): Promise<RepositoryWithBootstrap> {
  const user = await getAuthenticatedUser();
  const repo = await getRepositoryWithBootstrapStatus(repositoryId);

  if (repo.bootstrapStatus !== 'pr_pending') {
    return repo;
  }

  if (!repo.bootstrapPrUrl) {
    return repo;
  }

  // Extract PR number from URL: https://github.com/{owner}/{repo}/pull/{number}
  const prUrlMatch = repo.bootstrapPrUrl.match(
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (!prUrlMatch) {
    throw new Error(`Cannot parse PR number from URL: ${repo.bootstrapPrUrl}`);
  }

  const [, prOwner, prRepo, prNumber] = prUrlMatch;

  const response = await fetch(
    `https://api.github.com/repos/${prOwner}/${prRepo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API error when fetching PR status: ${response.status} ${response.statusText}`
    );
  }

  const pr = await response.json() as { state: string; merged_at: string | null };

  if (pr.merged_at) {
    // PR merged -> ready
    return updateBootstrapStatus(repositoryId, 'ready');
  } else if (pr.state === 'closed') {
    // PR closed without merge -> uninitialized + clear pr_url
    return updateBootstrapStatus(repositoryId, 'uninitialized');
  }

  // PR still open -> no change
  return repo;
}

/**
 * Handle bootstrap session completion without PR URL detection.
 * Transitions repository back to uninitialized and cancels the bootstrap request.
 * Verifies ownership: only the repository owner may trigger this rollback.
 */
export async function handleBootstrapSessionCompletedWithoutPr(
  repositoryId: number,
  bootstrapRequestId: number
): Promise<void> {
  // Ownership check: throws if repo not found or not owned by authenticated user
  await getRepositoryWithBootstrapStatus(repositoryId);

  const db = getDb();

  // Revert repository to uninitialized
  await db
    .update(repositories)
    .set({ bootstrapStatus: 'uninitialized' })
    .where(eq(repositories.id, repositoryId))
    .run();

  // Cancel the bootstrap request
  try {
    await db
      .update(requests)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(requests.id, bootstrapRequestId))
      .run();
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Process bootstrap session events and detect PR URL.
 * If PR URL is found, transitions to pr_pending.
 * Returns the detected PR URL or null.
 */
export async function processBootstrapSessionEvent(
  repositoryId: number,
  eventText: string
): Promise<string | null> {
  const prUrl = extractPrUrl(eventText);
  if (prUrl) {
    await setBootstrapPrUrl(repositoryId, prUrl);
    return prUrl;
  }
  return null;
}

/**
 * Archive all active sessions for a given request.
 * Used during rollback to clean up orphaned sessions.
 * Internal helper — not exported as a Server Action to prevent IDOR.
 */
async function archiveSessionsByRequest(requestId: number): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ status: 'archived', updatedAt: new Date().toISOString() })
    .where(eq(sessions.requestId, requestId))
    .run();
}
