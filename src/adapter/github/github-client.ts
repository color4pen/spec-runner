/**
 * Concrete implementation of the GitHubClient port.
 * Contains all GitHub API fetch logic, moved from src/core/steps/spec-review.ts
 * and src/core/step/executor.ts.
 */
import type { GitHubClient } from "../../core/port/github-client.js";
import { githubApiError, githubTokenExpiredError } from "../../errors.js";

export class GitHubApiClient implements GitHubClient {
  constructor(
    private readonly fetchFn: typeof globalThis.fetch,
    private readonly token: string,
  ) {}

  async verifyBranch(owner: string, repo: string, branch: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
    const resp = await this.fetchFn(url, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (resp.status === 401) {
      throw githubTokenExpiredError();
    }

    return resp.status !== 404;
  }

  async getRawFile(
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
    opts?: { maxRetries?: number; sleepFn?: (ms: number) => Promise<void> },
  ): Promise<string | null> {
    const maxRetries = opts?.maxRetries ?? 3;
    const sleepFn = opts?.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleepFn(1000);
      }

      const resp = await this.fetchFn(url, {
        headers: {
          Authorization: `token ${this.token}`,
          Accept: "application/vnd.github.v3.raw",
        },
      });

      if (resp.status === 200) {
        return resp.text();
      }

      if (resp.status === 401) {
        throw githubTokenExpiredError();
      }

      if (resp.status === 404) {
        if (attempt < maxRetries) {
          continue;
        }
        return null;
      }

      // Other errors: return null (best-effort)
      return null;
    }

    return null;
  }

  /**
   * Verify a folder/path exists in a repository.
   * - 200 → true
   * - 404 → false
   * - 401 → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
   * - any other status (5xx 含む) → throws SpecRunnerError(GITHUB_API_ERROR)
   * - network error → propagates from fetchFn
   */
  async verifyPath(owner: string, repo: string, branch: string, folderPath: string): Promise<boolean> {
    const encodedPath = folderPath.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    const resp = await this.fetchFn(url, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (resp.status === 200) return true;
    if (resp.status === 404) return false;
    if (resp.status === 401) {
      throw githubTokenExpiredError();
    }
    throw githubApiError(resp.status, `verifyPath(${owner}/${repo}@${branch}:${folderPath})`);
  }
}

/**
 * Factory function to create a GitHubApiClient.
 */
export function createGitHubClient(
  fetchFn: typeof globalThis.fetch,
  token: string,
): GitHubApiClient {
  return new GitHubApiClient(fetchFn, token);
}
