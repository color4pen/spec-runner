// GitHub REST API operations — no 'use server' directive.
// Pure API wrapper functions. Authentication is delegated to callers.

export interface PullRequestParams {
  head: string;
  base: string;
  title: string;
  body?: string;
}

export interface PullRequestResult {
  number: number;
  html_url: string;
}

export interface PullRequestStatus {
  state: 'open' | 'closed';
  merged: boolean;
  html_url: string;
}

/**
 * Create a pull request.
 * POST /repos/{owner}/{repo}/pulls
 */
export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  params: PullRequestParams
): Promise<PullRequestResult> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body ?? '',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API error when creating PR: ${response.status} ${response.statusText}`
    );
  }

  const pr = (await response.json()) as { number: number; html_url: string };
  return { number: pr.number, html_url: pr.html_url };
}

/**
 * Get pull request status.
 * GET /repos/{owner}/{repo}/pulls/{prNumber}
 * Returns state, merged, and html_url.
 */
export async function getPullRequestStatus(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestStatus> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API error when fetching PR status: ${response.status} ${response.statusText}`
    );
  }

  const pr = (await response.json()) as {
    state: string;
    merged_at: string | null;
    html_url: string;
  };
  return {
    state: pr.state === 'open' ? 'open' : 'closed',
    merged: pr.merged_at !== null,
    html_url: pr.html_url,
  };
}

/**
 * Close a pull request.
 * PATCH /repos/{owner}/{repo}/pulls/{prNumber}
 * Idempotent: if already closed, no-op (does not throw).
 */
export async function closePullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  // First check current state to ensure idempotency
  const status = await getPullRequestStatus(token, owner, repo, prNumber);
  if (status.state === 'closed') {
    // Already closed or merged — no-op
    return;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: 'closed' }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API error when closing PR: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Check if a branch exists in a repository.
 * GET /repos/{owner}/{repo}/branches/{branch}
 * Returns false for 404 (does not throw).
 */
export async function getBranchExists(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API error when checking branch: ${response.status} ${response.statusText}`
    );
  }

  return true;
}

/**
 * Delete a branch from a repository.
 * DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}
 * Idempotent: 404 (already deleted) and 422 (protected) are ignored.
 */
export async function deleteBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  // 404 = already deleted, 422 = protected branch — treat as no-op
  if (response.status === 404 || response.status === 422) {
    return;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API error when deleting branch: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Find an open PR by head branch.
 * GET /repos/{owner}/{repo}/pulls?head={owner}:{headBranch}&state=open
 * Used for idempotent PR creation: returns existing PR if one already exists.
 * Returns null if no open PR found.
 */
export async function findOpenPrByHead(
  token: string,
  owner: string,
  repo: string,
  headBranch: string
): Promise<PullRequestResult | null> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(headBranch)}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API error when searching PRs: ${response.status} ${response.statusText}`
    );
  }

  const prs = (await response.json()) as Array<{
    number: number;
    html_url: string;
  }>;
  if (prs.length === 0) {
    return null;
  }

  return { number: prs[0].number, html_url: prs[0].html_url };
}
