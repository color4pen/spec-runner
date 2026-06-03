/**
 * Aggregated check status for a commit ref.
 *
 * `state` interpretation:
 *   - "success": all checks (check runs + combined statuses) are in a non-blocking terminal state
 *   - "pending": at least one check is still running or has not yet reported a conclusion
 *   - "failure": at least one check has confirmed a failing terminal state (failure, timed_out, cancelled, etc.)
 *   - "none": no check runs and no commit statuses exist for the ref (branch protection absent)
 *
 * `failing`: names of checks in a failure terminal state (check run `name` / status `context`)
 * `pending`: names of checks that are still running or pending
 */
export interface CheckRollup {
  state: "success" | "pending" | "failure" | "none";
  total: number;
  failing: string[];
  pending: string[];
}

/**
 * Port interface for GitHub API interactions.
 * Adapter (src/adapter/github/) implements this; core never imports the adapter.
 */
export interface GitHubClient {
  /**
   * Verify that a branch exists in the repository.
   * Returns true if found, false if 404.
   * Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401.
   */
  verifyBranch(owner: string, repo: string, branch: string): Promise<boolean>;

  /**
   * Fetch the raw content of a file from a specific branch.
   * Returns null if not found after retries.
   * Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401.
   *
   * Retries up to maxRetries times with 1s interval on 404.
   */
  getRawFile(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    opts?: { maxRetries?: number; sleepFn?: (ms: number) => Promise<void> },
  ): Promise<string | null>;

  /**
   * Verify that a folder or path exists in the repository.
   * - 200 → true
   * - 404 → false
   * - 401 → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
   * - 5xx / network error → throws GitHubApiError (or equivalent throwable)
   *
   * Designed for folder-level existence checks. Returns correct answer even
   * in transient states where the folder exists but internal files are not yet present.
   */
  verifyPath(owner: string, repo: string, branch: string, path: string): Promise<boolean>;

  /**
   * Verify the current token and return its OAuth scopes.
   * Makes GET /user with the configured token and reads the X-OAuth-Scopes header.
   *
   * - status 200 → token valid; scopes contain the granted OAuth scopes
   * - status 401 → token invalid; scopes is []
   * - 5xx / network error → throws (caller is responsible for timeout/error handling)
   */
  verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>;

  /**
   * Fetch the HEAD commit SHA of a branch reference.
   *
   * Calls GET /repos/{owner}/{repo}/git/refs/heads/{branch}.
   *
   * - 200 → returns the commit SHA string
   * - 404 → returns null (branch does not exist)
   * - 401 → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
   * - any other status → throws SpecRunnerError(GITHUB_API_ERROR)
   *
   * Used by the agent-commit-verification path to detect whether a writing
   * agent (implementer / spec-fixer / build-fixer / code-fixer) actually
   * advanced the branch HEAD during its session.
   */
  getRefSha(owner: string, repo: string, branch: string): Promise<string | null>;

  /**
   * List pull requests for a branch (all states).
   * Always fetches state=all; caller filters as needed.
   *
   * - state: internal representation: "OPEN" / "MERGED" / "CLOSED"
   */
  listPullRequests(
    owner: string,
    repo: string,
    head: string,
    base: string,
  ): Promise<Array<{ url: string; number: number; state: string }>>;

  /**
   * Create a pull request.
   * Returns the URL and PR number of the created PR.
   */
  createPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<{ url: string; number: number }>;

  /**
   * Get a pull request by number.
   * Returns PrViewData-compatible shape for use by finish modules.
   *
   * - state: "OPEN" / "MERGED" / "CLOSED"
   * - mergeStateStatus: "CLEAN" / "BLOCKED" / "DIRTY" / "UNKNOWN" etc. (uppercased)
   * - headRefName: branch name
   * - mergeable: "MERGEABLE" / "CONFLICTING" / "UNKNOWN"
   * - headSha: HEAD commit SHA of the PR's head branch (REST `head.sha`)
   */
  getPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{
    state: string;
    mergeStateStatus?: string;
    headRefName?: string;
    mergeable?: string;
    headSha?: string;
  }>;

  /**
   * Get the aggregated check status for a commit ref (SHA or branch name).
   *
   * Combines GitHub Check Runs (`GET /repos/{owner}/{repo}/commits/{ref}/check-runs`)
   * and Commit Statuses (`GET /repos/{owner}/{repo}/commits/{ref}/status`) into a
   * single `CheckRollup`. All pages of check-runs are fetched (Link header pagination).
   *
   * Returns `state: "none"` when no checks exist (branch protection not configured).
   * Returns `state: "failure"` if any check has confirmed failure, even if others are pending.
   */
  getCheckStatus(owner: string, repo: string, ref: string): Promise<CheckRollup>;

  /**
   * Merge a pull request via squash merge.
   * - 200 → { merged: true, message }
   * - 405/409 → { merged: false, message } (not mergeable / merge conflict)
   * - 403 → { merged: false, message: "permission denied" hint }
   */
  mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    opts: { mergeMethod: "squash" },
  ): Promise<{ merged: boolean; message: string }>;
}
