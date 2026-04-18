'use server';

import { getAuthenticatedUser } from './auth-helpers';
import { getDb } from './db';
import { repositories, requests, sessions } from './db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createBoundSession } from './session-actions';
import { sendMessage } from './actions';
import { revalidatePath } from 'next/cache';
import { ensureVaultWithCredentials } from './vault-actions';
import {
  type BootstrapStatus,
  ALLOWED_BOOTSTRAP_TRANSITIONS,
  validateBootstrapTransition,
  isValidPrUrl,
} from './bootstrap-utils';
import {
  closePullRequest,
  deleteBranch,
  getBranchExists,
  getPullRequestStatus,
} from './github-api';
import { getAnthropicClient } from './anthropic';

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
 * - Specifies branch name: openspec-bootstrap/{owner}/{repo}
 * - Instructs commit + push only (no PR creation)
 */
function buildBootstrapMessage(owner: string, repoName: string): string {
  const branchName = `openspec-bootstrap/${owner}/${repoName}`;
  return `You are tasked with bootstrapping the openspec-workflow for the repository ${owner}/${repoName}.

Please perform the following steps in order:

1. **Create and checkout branch**: Create a new branch named \`${branchName}\` from the default branch.
   \`\`\`
   git checkout -b ${branchName}
   \`\`\`

2. **Run openspec init**: Execute \`npx @fission-ai/openspec init\` to initialize the openspec-workflow configuration.

3. **Create directory structure**: Ensure the following directories exist:
   - \`openspec/specs/\`
   - \`openspec/changes/\`
   - \`requests/active/\`
   - \`requests/done/\`
   - \`docs/\`

4. **Tech stack reconnaissance**: Read and analyze:
   - \`package.json\` (or \`Cargo.toml\`, \`go.mod\`, etc.) to identify the technology stack
   - \`tsconfig.json\` if present
   - README.md if present
   - List the main source directories

5. **Detect verification commands**: Identify the build, test, and lint commands from package.json scripts or equivalent. Document them in \`docs/verification-commands.md\`.

6. **Place review-standards**: Create or copy the review standards file at \`.claude/rules/review-standards.md\`. Use the standard openspec-workflow review standards content.

7. **Commit and push**: Stage all created/modified files, create a commit with message "bootstrap: initialize openspec-workflow", then push the branch:
   \`\`\`
   git add -A
   git commit -m "bootstrap: initialize openspec-workflow"
   git push origin ${branchName}
   \`\`\`

Note: Skip hooks-related setup as this is a managed agent environment.
Do not create a pull request — the application will handle PR creation automatically.
Do not ask for confirmation — proceed autonomously through all steps.`;
}

/**
 * Start bootstrap for a repository.
 * Flow: status bootstrapping → Vault setup → branch cleanup → request (type: bootstrap) → session (role: bootstrap) → message.
 * All steps after the status transition run inside a try block; any failure rolls back to uninitialized.
 * Guards: must be uninitialized, must be owned by authenticated user.
 */
export async function startBootstrap(
  repositoryId: number,
  agentId: string,
  environmentId: string
): Promise<{ requestId: number; sessionId: number; managedSessionId: string }> {
  const user = await getAuthenticatedUser();
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
    // Step 2a: Ensure Vault is set up with MCP credentials
    await ensureVaultWithCredentials(user.dbId, user.accessToken);

    // Step 2b: Check for existing branch and delete if present (idempotency)
    const branchName = `openspec-bootstrap/${repo.owner}/${repo.name}`;
    const branchExists = await getBranchExists(user.accessToken, repo.owner, repo.name, branchName);
    if (branchExists) {
      await deleteBranch(user.accessToken, repo.owner, repo.name, branchName);
    }

    // Step 3: Create bootstrap request (type: 'bootstrap') — direct DB insert
    // bypasses createRequest guard (bootstrapStatus !== 'ready')
    const now = new Date().toISOString();
    const [bootstrapRequest] = await db
      .insert(requests)
      .values({
        repositoryId,
        type: 'bootstrap',
        title: 'Bootstrap openspec-workflow',
        content: 'Automated bootstrap of openspec-workflow via managed agent session.',
        status: 'in-progress',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    requestId = bootstrapRequest.id;

    // Step 4: Create bound session (role: 'bootstrap')
    const session = await createBoundSession({
      requestId: bootstrapRequest.id,
      role: 'bootstrap',
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
 * Cancel bootstrap for a repository.
 * - bootstrapping: archive session → status uninitialized → request cancelled
 * - pr_pending: PR close + branch delete → pr_url clear → status uninitialized → request cancelled
 * - Idempotent: if already uninitialized, no-op
 */
export async function cancelBootstrap(repositoryId: number): Promise<void> {
  const user = await getAuthenticatedUser();
  const repo = await getRepositoryWithBootstrapStatus(repositoryId);

  if (repo.bootstrapStatus === 'uninitialized') {
    // Already cancelled — no-op
    return;
  }

  if (repo.bootstrapStatus === 'ready') {
    throw new Error('Cannot cancel bootstrap when repository is ready.');
  }

  const db = getDb();
  const now = new Date().toISOString();

  if (repo.bootstrapStatus === 'bootstrapping') {
    // Archive active sessions
    await archiveActiveSessionsByRepositoryId(repositoryId);

    // Revert status
    await db
      .update(repositories)
      .set({ bootstrapStatus: 'uninitialized' })
      .where(eq(repositories.id, repositoryId))
      .run();

    // Cancel active bootstrap requests
    await cancelBootstrapRequestsForRepository(repositoryId, now);
  } else if (repo.bootstrapStatus === 'pr_pending') {
    // Close PR if we have a URL
    if (repo.bootstrapPrUrl) {
      const prMatch = repo.bootstrapPrUrl.match(
        /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
      );
      if (prMatch) {
        const [, prOwner, prRepo, prNumberStr] = prMatch;
        const prNumber = parseInt(prNumberStr, 10);
        try {
          await closePullRequest(user.accessToken, prOwner, prRepo, prNumber);
        } catch {
          // Best-effort: continue with cancellation even if PR close fails
        }
      }
    }

    // Delete bootstrap branch
    const branchName = `openspec-bootstrap/${repo.owner}/${repo.name}`;
    try {
      await deleteBranch(user.accessToken, repo.owner, repo.name, branchName);
    } catch {
      // Best-effort: continue with cancellation even if branch delete fails
    }

    // Clear pr_url and revert status
    await db
      .update(repositories)
      .set({ bootstrapStatus: 'uninitialized', bootstrapPrUrl: null })
      .where(eq(repositories.id, repositoryId))
      .run();

    // Cancel active bootstrap requests
    await cancelBootstrapRequestsForRepository(repositoryId, now);
  }

  revalidatePath(`/repos/${repo.owner}/${repo.name}`);
}

/**
 * Archive all active sessions for a given repository (via requests chain).
 * Internal helper.
 */
async function archiveActiveSessionsByRepositoryId(repositoryId: number): Promise<void> {
  const db = getDb();
  const client = getAnthropicClient();
  const now = new Date().toISOString();

  // Find active sessions for this repository's requests
  const activeSessions = await db
    .select({ session: sessions })
    .from(sessions)
    .innerJoin(requests, eq(sessions.requestId, requests.id))
    .where(
      and(
        eq(requests.repositoryId, repositoryId),
        eq(sessions.status, 'active')
      )
    );

  for (const { session } of activeSessions) {
    try {
      await client.beta.sessions.archive(session.managedSessionId);
    } catch {
      // Best-effort: continue archiving other sessions
    }
    await db
      .update(sessions)
      .set({ status: 'archived', updatedAt: now })
      .where(eq(sessions.id, session.id))
      .run();
  }
}

/**
 * Cancel all non-terminal bootstrap requests for a repository.
 * Only transitions requests in 'draft', 'in-progress', or 'reviewing' states —
 * terminal states ('completed', 'cancelled') are excluded to preserve the audit trail.
 * Internal helper.
 */
async function cancelBootstrapRequestsForRepository(
  repositoryId: number,
  now: string
): Promise<void> {
  const db = getDb();
  await db
    .update(requests)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        eq(requests.repositoryId, repositoryId),
        eq(requests.type, 'bootstrap'),
        inArray(requests.status, ['draft', 'in-progress', 'reviewing'])
      )
    )
    .run();
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

  const [, prOwner, prRepo, prNumberStr] = prUrlMatch;
  const prNumber = parseInt(prNumberStr, 10);

  // Use github-api.ts instead of inline fetch
  const prStatus = await getPullRequestStatus(user.accessToken, prOwner, prRepo, prNumber);

  if (prStatus.merged) {
    // PR merged -> ready
    return updateBootstrapStatus(repositoryId, 'ready');
  } else if (prStatus.state === 'closed') {
    // PR closed without merge -> uninitialized + clear pr_url
    return updateBootstrapStatus(repositoryId, 'uninitialized');
  }

  // PR still open -> no change
  return repo;
}

