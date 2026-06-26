/**
 * Concrete implementation of the GitHubClient port.
 *
 * Provides a shared `request()` method with:
 *   - Authorization / Accept / X-GitHub-Api-Version headers
 *   - 401 → githubTokenExpiredError() (no retry)
 *   - 429 → Retry-After wait → retry (max 5 retries)
 *   - GET/DELETE 5xx / network error → exponential backoff (max 3 retries)
 *   - POST/PUT 5xx / network error → immediate throw (non-idempotent, no retry)
 *
 * PR operations (D1: extend existing port):
 *   listPullRequests / createPullRequest / getPullRequest / mergePullRequest
 *
 * Field mapping (D2): adapter boundary absorbs REST → internal naming.
 */
import type { GitHubClient, CheckRollup } from "../../core/port/github-client.js";
import { githubApiError, githubTokenExpiredError } from "../../errors.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { retryWithBackoff } from "../../util/retry.js";
import { stderrWrite } from "../../logger/stdout.js";

/** Current stable GitHub REST API version (D5). */
const API_VERSION = "2022-11-28";

const MAX_5XX_RETRIES = 3;
const MAX_429_RETRIES = 5;

export class GitHubApiClient implements GitHubClient {
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly mergeMaxAttempts: number;
  private readonly baseUrl: string;

  constructor(
    private readonly fetchFn: typeof globalThis.fetch,
    private readonly token: string,
    baseUrl: string,
    opts?: { sleepFn?: (ms: number) => Promise<void>; mergeMaxAttempts?: number },
  ) {
    this.baseUrl = baseUrl;
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
    let attempt429 = 0;

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
        // POST/PUT are non-idempotent — do not retry on network error
        if (init.method === "POST" || init.method === "PUT") throw err;
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

      // 429: Too Many Requests — wait Retry-After then retry (max MAX_429_RETRIES retries)
      if (response.status === 429) {
        if (attempt429 >= MAX_429_RETRIES) {
          throw githubApiError(429, `request(${url}): 429 after ${MAX_429_RETRIES} retries`);
        }
        const retryAfterHeader = response.headers.get("Retry-After");
        const waitSec = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : 60;
        await this.sleepFn(waitSec * 1000);
        attempt429++;
        continue;
      }

      // 5xx: exponential backoff for GET/DELETE; immediate throw for POST/PUT (non-idempotent)
      if (response.status >= 500) {
        if (init.method === "POST" || init.method === "PUT") {
          throw githubApiError(
            response.status,
            `request(${url}): 5xx on non-idempotent method ${init.method ?? "POST/PUT"}`,
          );
        }
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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

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
      const resp = await this.request(`${this.baseUrl}/user`, {
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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(headParam)}&base=${encodeURIComponent(base)}&state=all&per_page=10`;

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
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls`;
    const resp = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, head, base }),
    });

    if (resp.status !== 201) {
      if (resp.status === 422) {
        const body = (await resp.json().catch(() => ({}))) as {
          message?: string;
          errors?: Array<{ message?: string }>;
        };
        const allMessages = [
          body.message ?? "",
          ...(body.errors ?? []).map((e) => e.message ?? ""),
        ].join(" ");
        if (allMessages.toLowerCase().includes("already exists")) {
          const existing = await this.listPullRequests(owner, repo, head, base);
          const pr = existing.find((p) => p.state === "OPEN") ?? existing[0];
          if (pr) return { url: pr.url, number: pr.number };
          throw githubApiError(
            422,
            `createPullRequest(${owner}/${repo}): already exists but no matching PR found`,
          );
        }
        throw githubApiError(
          422,
          `createPullRequest(${owner}/${repo}): ${allMessages.slice(0, 200) || "Unprocessable Entity"}`,
        );
      }
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
    headSha?: string;
  }> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`;
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
      head: { ref: string; sha?: string };
    };

    return {
      state: mapPrState(data.state, data.merged_at),
      mergeStateStatus: data.mergeable_state != null
        ? data.mergeable_state.toUpperCase()
        : undefined,
      headRefName: data.head?.ref,
      mergeable: mapMergeable(data.mergeable),
      headSha: data.head?.sha,
    };
  }

  /**
   * Get the aggregated check status for a commit ref.
   *
   * Fetches all check runs (all pages via Link header) and combined commit statuses,
   * then aggregates into a CheckRollup.
   */
  async getCheckStatus(owner: string, repo: string, ref: string): Promise<CheckRollup> {
    // Fetch all check run pages
    const checkRuns: Array<{ name: string; status: string; conclusion: string | null }> = [];
    let checkRunsUrl: string | null =
      `${this.baseUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`;

    while (checkRunsUrl !== null) {
      validateSameOrigin(checkRunsUrl, this.baseUrl);
      const resp = await this.request(checkRunsUrl);
      if (resp.status !== 200) {
        throw githubApiError(resp.status, `getCheckStatus check-runs(${owner}/${repo}@${ref})`);
      }
      const data = (await resp.json()) as {
        check_runs: Array<{ name: string; status: string; conclusion: string | null }>;
      };
      checkRuns.push(...data.check_runs);

      // Follow Link: rel="next" for pagination
      const linkHeader = resp.headers.get("Link");
      checkRunsUrl = parseNextLink(linkHeader);
    }

    // Fetch all commit statuses via paginated /statuses endpoint
    const commitStatuses: Array<{ context: string; state: string }> = [];
    const seenContexts = new Set<string>();
    let statusesUrl: string | null =
      `${this.baseUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/statuses?per_page=100`;

    while (statusesUrl !== null) {
      validateSameOrigin(statusesUrl, this.baseUrl);
      const statusResp = await this.request(statusesUrl);
      if (statusResp.status !== 200) {
        throw githubApiError(statusResp.status, `getCheckStatus statuses(${owner}/${repo}@${ref})`);
      }
      const page = (await statusResp.json()) as Array<{ context: string; state: string }>;
      for (const s of page) {
        if (!seenContexts.has(s.context)) {
          seenContexts.add(s.context);
          commitStatuses.push(s);
        }
      }
      statusesUrl = parseNextLink(statusResp.headers.get("Link"));
    }

    const total = checkRuns.length + commitStatuses.length;

    if (total === 0) {
      return { state: "none", total: 0, failing: [], pending: [] };
    }

    const failingNames: string[] = [];
    const pendingNames: string[] = [];

    for (const run of checkRuns) {
      const normalized = normalizeCheckRun(run.status, run.conclusion);
      if (normalized === "failure") {
        failingNames.push(run.name);
      } else if (normalized === "pending") {
        pendingNames.push(run.name);
      }
    }

    for (const status of commitStatuses) {
      const normalized = normalizeCommitStatus(status.state);
      if (normalized === "failure") {
        failingNames.push(status.context);
      } else if (normalized === "pending") {
        pendingNames.push(status.context);
      }
    }

    if (failingNames.length > 0) {
      return { state: "failure", total, failing: failingNames, pending: pendingNames };
    }
    if (pendingNames.length > 0) {
      return { state: "pending", total, failing: [], pending: pendingNames };
    }
    return { state: "success", total, failing: [], pending: [] };
  }

  /**
   * Create a comment on an issue.
   * POST /repos/{owner}/{repo}/issues/{issueNumber}/comments
   * Expects 201; returns { id, url } mapped from REST id / html_url.
   */
  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; url: string }> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    const resp = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    if (resp.status !== 201) {
      const text = await resp.text().catch(() => "");
      throw githubApiError(resp.status, `createIssueComment(${owner}/${repo}#${issueNumber}): ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as { id: number; html_url: string };
    return { id: data.id, url: data.html_url };
  }

  /**
   * List the files changed by a pull request, following Link: rel="next" pagination.
   *
   * GitHub caps this endpoint at 3000 files. When the cap is reached,
   * returns `truncated: true` so callers can fail-closed.
   */
  async listPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{ files: string[]; truncated: boolean }> {
    const MAX_FILES = 3000;
    const files: string[] = [];
    let nextUrl: string | null =
      `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;

    while (nextUrl !== null) {
      validateSameOrigin(nextUrl, this.baseUrl);
      const resp = await this.request(nextUrl);
      if (resp.status !== 200) {
        throw githubApiError(resp.status, `listPullRequestFiles(${owner}/${repo}#${prNumber})`);
      }

      const data = (await resp.json()) as Array<{ filename: string }>;
      for (const entry of data) {
        files.push(entry.filename);
      }

      // Check for truncation: if we've reached the cap, fail-closed
      if (files.length >= MAX_FILES) {
        return { files, truncated: true };
      }

      const linkHeader = resp.headers.get("Link");
      nextUrl = parseNextLink(linkHeader);
    }

    return { files, truncated: false };
  }

  /**
   * Merge a pull request (squash).
   * Merge depends on branch protection being satisfied — no admin bypass is performed.
   *
   * Transient failures (405 + "Base branch was modified" / "unstable state" / "is expected", 423 Locked)
   * are retried with exponential backoff (1 s → 2 s → 4 s, up to 3 retries).
   * Permanent failures (403, 409, non-transient 405) are returned immediately without retry.
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    opts: { mergeMethod: "squash" },
  ): Promise<{ merged: boolean; message: string }> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/merge`;

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
        // 405 "already merged" → report as success (idempotent)
        if (resp.status === 405 && (data.message ?? "").toLowerCase().includes("already merged")) {
          return { merged: true, message: "Pull Request already merged" };
        }
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

  /**
   * Search for open issues with a given label, excluding pull requests.
   * Follows Link header pagination to fetch all pages.
   */
  async searchOpenIssuesByLabel(
    owner: string,
    repo: string,
    label: string,
  ): Promise<Array<{ number: number; title: string; body: string }>> {
    const issues: Array<{ number: number; title: string; body: string }> = [];
    let nextUrl: string | null =
      `${this.baseUrl}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100`;

    while (nextUrl !== null) {
      validateSameOrigin(nextUrl, this.baseUrl);
      const resp = await this.request(nextUrl);
      if (resp.status !== 200) {
        throw githubApiError(resp.status, `searchOpenIssuesByLabel(${owner}/${repo} label=${label})`);
      }

      const data = (await resp.json()) as Array<{
        number: number;
        title: string;
        body: string | null;
        pull_request?: unknown;
      }>;

      for (const item of data) {
        // Exclude pull requests (they appear in the issues endpoint but have pull_request field)
        if (item.pull_request !== undefined) continue;
        issues.push({
          number: item.number,
          title: item.title,
          body: item.body ?? "",
        });
      }

      const linkHeader = resp.headers.get("Link");
      nextUrl = parseNextLink(linkHeader);
    }

    return issues;
  }

  /**
   * Remove a label from an issue.
   * DELETE /repos/{owner}/{repo}/issues/{issueNumber}/labels/{label}
   * 200 or 204 → success; 404 → success (idempotent); other non-2xx → throws GITHUB_API_ERROR.
   */
  async removeLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`;
    const resp = await this.request(url, { method: "DELETE" });
    if (resp.status === 200 || resp.status === 204 || resp.status === 404) return;
    throw githubApiError(resp.status, `removeLabel(${owner}/${repo}#${issueNumber} label=${label})`);
  }

  /**
   * List all comments on an issue in ascending creation order.
   * Follows Link header pagination to fetch all pages.
   */
  async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Array<{ id: number; body: string; authorAssociation: string; createdAt: string }>> {
    const comments: Array<{ id: number; body: string; authorAssociation: string; createdAt: string }> = [];
    let nextUrl: string | null =
      `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;

    while (nextUrl !== null) {
      validateSameOrigin(nextUrl, this.baseUrl);
      const resp = await this.request(nextUrl);
      if (resp.status !== 200) {
        throw githubApiError(resp.status, `listIssueComments(${owner}/${repo}#${issueNumber})`);
      }

      const data = (await resp.json()) as Array<{
        id: number;
        body: string;
        author_association: string;
        created_at: string;
      }>;

      for (const item of data) {
        comments.push({
          id: item.id,
          body: item.body,
          authorAssociation: item.author_association,
          createdAt: item.created_at,
        });
      }

      const linkHeader = resp.headers.get("Link");
      nextUrl = parseNextLink(linkHeader);
    }

    return comments;
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
 *   - 405 + "Base branch was modified"        — GitHub TOCTOU race during squash merge
 *   - 405 + "unstable state"                  — GitHub internal consistency lag
 *   - 423 Locked                              — branch protection temporary lock
 *   - 405 + "not mergeable"                   — GitHub metadata recalculation lag after push
 *   - 405 + "head branch was modified"        — push/merge race condition
 *   - 405 + "required status check...is expected" — CI pending race (check not yet reported)
 *
 * Permanent conditions (no retry — returned as-is):
 *   - 403 permission denied
 *   - 409 actual merge conflict
 *   - 405 + "required status check...has failed" — CI failed (branch protection blocks merge)
 *   - 5xx are handled upstream by request() and never reach here
 */
function isMergeTransientFailure(result: { merged: boolean; message: string }): boolean {
  if (result.merged) return false;
  const msg = result.message.toLowerCase();

  // "required status check" requires careful classification:
  //   "is expected" — CI pending race; retry may succeed once CI reports
  //   "has failed"  — CI explicitly failed; retry won't help (escalate)
  //   other         — unknown state; treat as permanent (safe side)
  if (msg.includes("required status check")) {
    return msg.includes("is expected");
  }

  return (
    msg.includes("base branch was modified") ||
    msg.includes("unstable state") ||
    msg.includes("locked") ||
    msg.includes("not mergeable") ||
    msg.includes("head branch was modified")
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
 * Normalize a GitHub Check Run into a 3-value state.
 *
 * - status !== "completed" → pending (still running)
 * - completed + conclusion ∈ {success, neutral, skipped} → success
 * - completed + conclusion ∈ {failure, timed_out, cancelled, action_required, startup_failure, stale} → failure
 * - completed + conclusion null → pending (defensive: completed but no conclusion yet)
 */
function normalizeCheckRun(
  status: string,
  conclusion: string | null,
): "success" | "pending" | "failure" {
  if (status !== "completed") return "pending";
  if (conclusion === null) return "pending";
  if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") {
    return "success";
  }
  return "failure";
}

/**
 * Normalize a GitHub Commit Status into a 3-value state.
 *
 * - "success" → success
 * - "pending" → pending
 * - "failure" | "error" → failure
 */
function normalizeCommitStatus(state: string): "success" | "pending" | "failure" {
  if (state === "success") return "success";
  if (state === "pending") return "pending";
  return "failure";
}

/**
 * Parse the Retry-After header value.
 *
 * Supports:
 *   - Integer seconds:  "30" → 30 s (capped at 60 s)
 *   - HTTP-date:        "Wed, 21 Oct 2025 07:28:00 GMT" → seconds until that date (min 1, max 60)
 *   - Unparseable:      any other value → safe fallback of 60 s (never instant)
 */
function parseRetryAfter(header: string): number {
  // Try integer seconds
  const asInt = parseInt(header, 10);
  if (!isNaN(asInt) && asInt >= 0) {
    return Math.min(asInt, 60);
  }
  // Try HTTP-date
  const asDate = new Date(header).getTime();
  if (!isNaN(asDate)) {
    const delaySec = Math.ceil((asDate - Date.now()) / 1000);
    return Math.min(Math.max(delaySec, 1), 60);
  }
  // Safe fallback — never instant
  return 60;
}

/**
 * Verify that `nextUrl` has the same origin (protocol + hostname + port) as `baseUrl`.
 * Throws GITHUB_API_ERROR if the origins differ, preventing token exfiltration via
 * a malicious Link header pointing to an attacker-controlled host.
 *
 * The initial URL (constructed from `this.baseUrl`) is trusted by construction and
 * does not need to be validated; only Link-header-derived next URLs require this check.
 */
function validateSameOrigin(nextUrl: string, baseUrl: string): void {
  const next = new URL(nextUrl);
  const base = new URL(baseUrl);
  if (next.protocol !== base.protocol || next.hostname !== base.hostname || next.port !== base.port) {
    throw githubApiError(
      0,
      `Pagination next URL origin mismatch: expected ${base.origin}, got ${next.origin}`,
    );
  }
}

/**
 * Parse the `next` URL from a GitHub Link header.
 * Returns null if no next page is present.
 */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link header format: <url>; rel="next", <url>; rel="last"
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1]!;
  }
  return null;
}

/**
 * Factory function to create a GitHubApiClient.
 */
export function createGitHubClient(
  fetchFn: typeof globalThis.fetch,
  token: string,
  baseUrl: string,
  opts?: { sleepFn?: (ms: number) => Promise<void> },
): GitHubApiClient {
  return new GitHubApiClient(fetchFn, token, baseUrl, opts);
}
