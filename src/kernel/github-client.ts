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

  /**
   * Create a comment on an issue.
   * Forge-neutral semantics: owner / repo / issueNumber / body only.
   * Returns the created comment's id and url.
   *
   * Expects HTTP 201. Throws SpecRunnerError(GITHUB_API_ERROR) on non-201.
   * Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401 (via shared request() layer).
   *
   * @param owner  Repository owner (user or org name).
   * @param repo   Repository name.
   * @param issueNumber  GitHub issue number.
   * @param body   Markdown body of the comment.
   */
  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; url: string }>;

  /**
   * List the files changed by a pull request.
   * Calls GET /repos/{owner}/{repo}/pulls/{pull_number}/files with per_page=100,
   * following Link: rel="next" for pagination.
   *
   * The GitHub API caps results at 3000 files. When the cap is reached,
   * `truncated` is set to `true` so callers can fail-closed rather than
   * silently miss protected-path matches.
   *
   * - Returns `{ files, truncated: false }` when all changed files fit under the cap.
   * - Returns `{ files, truncated: true }` when the 3000-file cap is reached.
   * - Throws SpecRunnerError(GITHUB_API_ERROR) on non-200 responses.
   * - Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401 (via shared request() layer).
   */
  listPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{ files: string[]; truncated: boolean }>;

  /**
   * Search for open issues with a given label, excluding pull requests.
   * Calls GET /repos/{owner}/{repo}/issues?labels=<label>&state=open with per_page=100,
   * following Link: rel="next" for pagination.
   *
   * - Returns array of { number, title, body } for each matching issue.
   * - Pull requests (items with pull_request field) are excluded.
   * - body is normalized: null values are returned as empty string.
   * - Throws SpecRunnerError(GITHUB_API_ERROR) on non-200 responses.
   * - Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401 (via shared request() layer).
   *
   * @param owner  Repository owner (user or org name).
   * @param repo   Repository name.
   * @param label  Label name to filter by.
   */
  searchOpenIssuesByLabel(
    owner: string,
    repo: string,
    label: string,
  ): Promise<Array<{ number: number; title: string; body: string }>>;

  /**
   * List all comments on an issue, in ascending creation order.
   * Calls GET /repos/{owner}/{repo}/issues/{issueNumber}/comments with per_page=100,
   * following Link: rel="next" for pagination.
   *
   * - Returns array of { id, body, authorAssociation, createdAt } for each comment.
   * - Throws SpecRunnerError(GITHUB_API_ERROR) on non-200 responses.
   * - Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401 (via shared request() layer).
   *
   * @param owner        Repository owner (user or org name).
   * @param repo         Repository name.
   * @param issueNumber  GitHub issue number.
   */
  listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Array<{ id: number; body: string; authorAssociation: string; createdAt: string }>>;
}
