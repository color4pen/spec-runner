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
}
