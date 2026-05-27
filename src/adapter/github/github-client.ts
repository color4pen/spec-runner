/**
 * Concrete implementation of the GitHubClient port.
 *
 * Provides a shared `request()` method with:
 *   - Authorization / Accept / X-GitHub-Api-Version headers
 *   - 401 → githubTokenExpiredError() (no retry)
 *   - 429 → Retry-After wait → retry (unlimited)
 *   - X-RateLimit-Remaining: 0 → reset wait → retry (unlimited)
 *   - 5xx / network error → exponential backoff (max 3 retries)
 *
 * PR operations (D1: extend existing port):
 *   listPullRequests / createPullRequest / getPullRequest / mergePullRequest
 *
 * Field mapping (D2): adapter boundary absorbs REST → internal naming.
 */
import type { GitHubClient } from "../../core/port/github-client.js";
import { githubApiError, githubTokenExpiredError } from "../../errors.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { retryWithBackoff } from "../../util/retry.js";
import { stderrWrite } from "../../logger/stdout.js";

/** Current stable GitHub REST API version (D5). */
const API_VERSION = "2022-11-28";

const MAX_5XX_RETRIES = 3;

export class GitHubApiClient implements GitHubClient {
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly mergeMaxAttempts: number;

  constructor(
    private readonly fetchFn: typeof globalThis.fetch,
    private readonly token: string,
    opts?: { sleepFn?: (ms: number) => Promise<void>; mergeMaxAttempts?: number },
  ) {
    this.sleepFn = opts?.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.mergeMaxAttempts = opts?.mergeMaxAttempts ?? 4;
  }

  // ---------------------------------------------------------------------------
  // Shared request() — retry / rate-limit middleware (D3)
  // ---------------------------------------------------------------------------

  /**
   * Internal request options — headers must be a plain object so merging is safe.
   * All internal callers use object literals; no `Headers` instance or array form.
   */
  private async request(
    url: string,
    init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    let attempt5xx = 0;

    while (true) {
      const callerHeaders = init.headers ?? {};
      const headers: Record<string, string> = {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": API_VERSION,
        ...callerHeaders,
      };

      let response: Response;
      try {
        response = await this.fetchFn(url, { ...init, headers });
      } catch (err) {
        // Network / connection error
        if (attempt5xx >= MAX_5XX_RETRIES) throw err;
        const delay = jitterDelay(attempt5xx);
        await this.sleepFn(delay);
        attempt5xx++;
        continue;
      }

      // 401: token expired — throw immediately, no retry
      if (response.status === 401) {
        throw githubTokenExpiredError();
      }

      // 429: Too Many Requests — wait Retry-After then retry (unlimited)
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const waitSec = retryAfterHeader ? Math.min(parseInt(retryAfterHeader, 10), 60) : 60;
        await this.sleepFn(waitSec * 1000);
        continue;
      }

      // Secondary rate limit: X-RateLimit-Remaining: 0 — wait until reset
      const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
      if (rateLimitRemaining === "0") {
        const resetHeader = response.headers.get("X-RateLimit-Reset");
        const resetEpochSec = resetHeader ? parseInt(resetHeader, 10) : 0;
        const waitMs = resetEpochSec
          ? Math.min(Math.max(resetEpochSec * 1000 - Date.now(), 0), 300_000)
          : 60_000;
        if (waitMs > 0) await this.sleepFn(waitMs);
        continue;
      }

      // 5xx: exponential backoff, max MAX_5XX_RETRIES retries
      if (response.status >= 500) {
        if (attempt5xx >= MAX_5XX_RETRIES) {
          // Exhausted — throw so all callers handle 5xx consistently
          throw githubApiError(response.status, `request(${url}): 5xx after ${MAX_5XX_RETRIES} retries`);
        }
        const delay = jitterDelay(attempt5xx);
        await this.sleepFn(delay);
        attempt5xx++;
        continue;
      }

      return response;
    }
  }

  // ---------------------------------------------------------------------------
  // Existing methods — refactored to use request()
  // ---------------------------------------------------------------------------

  async verifyBranch(owner: string, repo: string, branch: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
    const resp = await this.request(url);
    // 401 → already thrown by request()
    // 5xx exhausted → already thrown by request()
    if (resp.status === 200) return true;
    if (resp.status === 404) return false;
    throw githubApiError(resp.status, `verifyBranch(${owner}/${repo}@${branch})`);
  }

  async getRawFile(
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
    opts?: { maxRetries?: number; sleepFn?: (ms: number) => Promise<void> },
  ): Promise<string | null> {
    const maxRetries = opts?.maxRetries ?? 3;
    // getRawFile has its own sleep for 404 retries; 5xx sleep is handled by request()
    const localSleepFn = opts?.sleepFn ?? this.sleepFn;

    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await localSleepFn(1000);
      }

      // request() handles: 401 (throws), 429, rate-limit, 5xx retry (throws on exhaustion)
      let resp: Response;
      try {
        resp = await this.request(url, {
          headers: { Accept: "application/vnd.github.v3.raw" },
        });
      } catch (err) {
        // 401 → rethrow (token expired)
        if (err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED) throw err;
        // 5xx exhausted → best-effort null (existing behaviour)
        return null;
      }

      if (resp.status === 200) {
        return resp.text();
      }

      if (resp.status === 401) {
        // Unreachable (request() throws on 401), but guard for safety
        throw githubTokenExpiredError();
      }

      if (resp.status === 404) {
        if (attempt < maxRetries) continue;
        return null;
      }

      // Other non-success status — best-effort null
      return null;
    }

    return null;
  }

  /**
   * Verify the current token and return its OAuth scopes.
   * - GET /user → reads X-OAuth-Scopes header
   * - 200 → { status: 200, scopes: [...] }
   * - 401 → { status: 401, scopes: [] }  (request() throws; caught and mapped here)
   * - 5xx / network error → propagates as thrown error
   */
  async verifyTokenScopes(): Promise<{ status: number; scopes: string[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await this.request("https://api.github.com/user", {
        signal: controller.signal,
      });
      clearTimeout(timer);

      const scopeHeader = resp.headers.get("X-OAuth-Scopes") ?? "";
      const scopes = scopeHeader
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      return { status: resp.status, scopes };
    } catch (err) {
      clearTimeout(timer);
      // request() throws githubTokenExpiredError() on 401 — map back to { status: 401, scopes: [] }
      if (err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED) {
        return { status: 401, scopes: [] };
      }
      throw err;
    }
  }

  /**
   * Verify a folder/path exists in a repository.
   * - 200 → true
   * - 404 → false
   * - 401 → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)   [via request()]
   * - any other status (5xx 含む) → throws SpecRunnerError(GITHUB_API_ERROR)
   */
  async getRefSha(owner: string, repo: string, branch: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
    const resp = await this.request(url);

    if (resp.status === 200) {
      const data = (await resp.json()) as { object?: { sha?: string } };
      const sha = data?.object?.sha;
      if (typeof sha !== "string" || sha.length === 0) {
        throw githubApiError(resp.status, `getRefSha(${owner}/${repo}@${branch}): malformed response`);
      }
      return sha;
    }
    if (resp.status === 404) return null;
    // 401 → already thrown by request()
    throw githubApiError(resp.status, `getRefSha(${owner}/${repo}@${branch})`);
  }

  async verifyPath(owner: string, repo: string, branch: string, folderPath: string): Promise<boolean> {
    const encodedPath = folderPath.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    const resp = await this.request(url);

    if (resp.status === 200) return true;
    if (resp.status === 404) return false;
    // 401 → already thrown by request()
    throw githubApiError(resp.status, `verifyPath(${owner}/${repo}@${branch}:${folderPath})`);
  }

  // ---------------------------------------------------------------------------
  // PR operations (T-02c)
  // ---------------------------------------------------------------------------

  /**
   * List pull requests for a branch (state=all).
   * Mapping (D2): REST state+merged_at → internal OPEN/MERGED/CLOSED.
   */
  async listPullRequests(
    owner: string,
    repo: string,
    head: string,
    base: string,
  ): Promise<Array<{ url: string; number: number; state: string }>> {
    // GitHub REST requires head as "owner:branch"
    const headParam = `${owner}:${head}`;
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(headParam)}&base=${encodeURIComponent(base)}&state=all&per_page=10`;

    const resp = await this.request(url);
    if (resp.status !== 200) {
      throw githubApiError(resp.status, `listPullRequests(${owner}/${repo} head=${head} base=${base})`);
    }

    const data = (await resp.json()) as Array<{
      html_url: string;
      number: number;
      state: string;
      merged_at: string | null;
    }>;

    return data.map((pr) => ({
      url: pr.html_url,
      number: pr.number,
      state: mapPrState(pr.state, pr.merged_at),
    }));
  }

  /**
   * Create a pull request.
   */
  async createPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<{ url: string; number: number }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const resp = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, head, base }),
    });

    if (resp.status !== 201) {
      const text = await resp.text().catch(() => "");
      throw githubApiError(resp.status, `createPullRequest(${owner}/${repo}): ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as { html_url: string; number: number };
    return { url: data.html_url, number: data.number };
  }

  /**
   * Get a pull request by number.
   * Applies D2 field mapping: REST → internal names.
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{
    state: string;
    mergeStateStatus?: string;
    headRefName?: string;
    mergeable?: string;
  }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
    const resp = await this.request(url);

    if (resp.status === 404) {
      throw githubApiError(resp.status, `getPullRequest(${owner}/${repo}#${prNumber}): not found`);
    }
    if (resp.status !== 200) {
      throw githubApiError(resp.status, `getPullRequest(${owner}/${repo}#${prNumber})`);
    }

    const data = (await resp.json()) as {
      state: string;
      merged: boolean;
      merged_at: string | null;
      mergeable_state: string | null;
      mergeable: boolean | null;
      head: { ref: string };
    };

    return {
      state: mapPrState(data.state, data.merged_at),
      mergeStateStatus: data.mergeable_state != null
        ? data.mergeable_state.toUpperCase()
        : undefined,
      headRefName: data.head?.ref,
      mergeable: mapMergeable(data.mergeable),
    };
  }

  /**
   * Merge a pull request (squash).
   * D4: REST API does not have --admin equivalent; admin token bypasses implicitly.
   *
   * Transient failures (405 + "Base branch was modified" / "unstable state", 423 Locked)
   * are retried with exponential backoff (1 s → 2 s → 4 s, up to 3 retries).
   * Permanent failures (403, 409, non-transient 405) are returned immediately without retry.
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    opts: { mergeMethod: "squash" },
  ): Promise<{ merged: boolean; message: string }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`;

    const attemptMerge = async (): Promise<{ merged: boolean; message: string }> => {
      const resp = await this.request(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merge_method: opts.mergeMethod }),
      });

      if (resp.status === 200) {
        const data = (await resp.json().catch(() => ({}))) as { message?: string };
        return { merged: true, message: data.message ?? "Pull request merged" };
      }

      if (resp.status === 403) {
        return {
          merged: false,
          message: "Merge failed: permission denied. Check admin token or repository merge policy.",
        };
      }

      if (resp.status === 405 || resp.status === 409) {
        const data = (await resp.json().catch(() => ({ message: "" }))) as { message?: string };
        return { merged: false, message: data.message ?? `Merge not allowed (status ${resp.status})` };
      }

      if (resp.status === 423) {
        const data = (await resp.json().catch(() => ({}))) as { message?: string };
        return { merged: false, message: data.message || "Merge failed: branch locked (status 423)" };
      }

      const text = await resp.text().catch(() => "");
      return { merged: false, message: `Merge failed (status ${resp.status}): ${text.slice(0, 200)}` };
    };

    return retryWithBackoff(attemptMerge, {
      shouldRetryResult: isMergeTransientFailure,
      maxAttempts: this.mergeMaxAttempts,
      baseDelayMs: 1000,
      sleepFn: this.sleepFn,
      onRetry: (attempt, info) => {
        const msg = info.result?.message ?? "unknown error";
        const maxRetries = this.mergeMaxAttempts - 1;
        stderrWrite(`GitHub PR merge retry: ${msg}, retrying (${attempt}/${maxRetries})...`);
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a mergePullRequest result represents a transient failure
 * that should be retried with exponential backoff.
 *
 * Transient conditions (retry):
 *   - 405 + "Base branch was modified"    — GitHub TOCTOU race during squash merge
 *   - 405 + "unstable state"              — GitHub internal consistency lag
 *   - 423 Locked                          — branch protection temporary lock
 *   - 405 + "not mergeable"               — GitHub metadata recalculation lag after push
 *   - 405 + "head branch was modified"    — push/merge race condition
 *   - 405 + "required status check"       — CI completion race
 *
 * Permanent conditions (no retry — returned as-is):
 *   - 403 permission denied
 *   - 409 actual merge conflict
 *   - 5xx are handled upstream by request() and never reach here
 */
function isMergeTransientFailure(result: { merged: boolean; message: string }): boolean {
  if (result.merged) return false;
  const msg = result.message.toLowerCase();
  return (
    msg.includes("base branch was modified") ||
    msg.includes("unstable state") ||
    msg.includes("locked") ||
    msg.includes("not mergeable") ||
    msg.includes("head branch was modified") ||
    msg.includes("required status check")
  );
}

/**
 * Map REST API PR state + merged_at to internal state.
 * REST: state="open"/"closed", merged_at=string|null
 * Internal: "OPEN" / "MERGED" / "CLOSED"
 */
function mapPrState(state: string, mergedAt: string | null | undefined): string {
  if (mergedAt) return "MERGED";
  if (state === "open") return "OPEN";
  return "CLOSED";
}

/**
 * Map REST API mergeable bool|null to internal string.
 * true → "MERGEABLE", false → "CONFLICTING", null → "UNKNOWN"
 */
function mapMergeable(mergeable: boolean | null | undefined): string {
  if (mergeable === true) return "MERGEABLE";
  if (mergeable === false) return "CONFLICTING";
  return "UNKNOWN";
}

/**
 * Exponential backoff delay with jitter.
 * attempt=0 → ~1s, attempt=1 → ~2s, attempt=2 → ~4s
 */
function jitterDelay(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  return base + Math.random() * 500;
}

/**
 * Factory function to create a GitHubApiClient.
 */
export function createGitHubClient(
  fetchFn: typeof globalThis.fetch,
  token: string,
  opts?: { sleepFn?: (ms: number) => Promise<void> },
): GitHubApiClient {
  return new GitHubApiClient(fetchFn, token, opts);
}
