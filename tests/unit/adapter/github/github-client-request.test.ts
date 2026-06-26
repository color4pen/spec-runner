/**
 * Unit tests for GitHubApiClient request() middleware.
 *
 * Tests are exercised via public methods (getRefSha / verifyBranch / createIssueComment /
 * mergePullRequest) since request() is private. sleepFn is injected so tests run without
 * real delays.
 *
 * TC-RC-001: X-GitHub-Api-Version header on every request
 * TC-RC-002: Authorization: token <token> header
 * TC-RC-003: 401 → immediate throw, no retry
 * TC-RC-004: 429 → wait Retry-After seconds, then retry
 * TC-RC-005: Retry-After capped at 60 seconds
 * TC-RC-006: 2xx + X-RateLimit-Remaining:0 → returned immediately (no rate-limit retry)
 * TC-RC-007: GET 5xx → exponential backoff, succeeds on eventual 200 (unaffected by T-02)
 * TC-RC-008: GET 5xx retry exhausted (4 total attempts) → throws GITHUB_API_ERROR
 * TC-RC-009: 429 retry exhausted (6 total attempts) → throws GITHUB_API_ERROR
 * TC-RC-010: 200 + X-RateLimit-Remaining=0 → returned immediately (not retried)
 * TC-RC-012: POST 201 + X-RateLimit-Remaining:0 → returned immediately without second fetch
 * TC-RC-013: POST 500 → throws GITHUB_API_ERROR after exactly 1 fetch, no backoff sleep
 * TC-RC-014: PUT 502 → throws GITHUB_API_ERROR after exactly 1 fetch, no backoff sleep
 * TC-RC-016: Retry-After HTTP-date ~30s future → sleepFn in [25_000, 60_000]
 * TC-RC-017: Retry-After garbage → sleepFn(60_000) fallback
 * TC-RC-018: Retry-After HTTP-date in past → sleepFn(1_000) floor
 *
 * Note: TC-RC-011 (429 + rate-limit mixed exhaustion) is removed — the X-RateLimit-Remaining:0
 * retry block was eliminated (T-01). The 429 exhaustion path is covered by TC-RC-009 alone.
 * Note: TC-RC-007/TC-RC-008 confirm that GET 5xx retry behavior is unaffected by T-02.
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { ERROR_CODES } from "../../../../src/errors.js";

const OWNER = "testowner";
const REPO = "testrepo";
const BRANCH = "main";
const TOKEN = "ghp_testtoken";
const SHA = "abc123def456abc123def456abc123def456abc1";
const PR_NUMBER = 42;

/** Build a response stub with controllable headers. */
function makeResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string | null> = {},
): Response {
  const headerMap = new Map<string, string>(
    Object.entries(headers).filter(([, v]) => v !== null) as [string, string][],
  );
  return {
    status,
    headers: { get: (key: string) => headerMap.get(key) ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Minimal 200 response for getRefSha. */
function okRefShaResponse(): Response {
  return makeResponse(200, { object: { sha: SHA } });
}

/** Minimal 200 response for verifyBranch. */
function okBranchResponse(): Response {
  return makeResponse(200, { name: BRANCH });
}

/** Build a client with a no-op sleepFn (fast tests) and a trackable sleepFn. */
function buildClient(
  mockFetch: typeof fetch,
  sleepFn: (ms: number) => Promise<void> = () => Promise.resolve(),
): GitHubApiClient {
  return new GitHubApiClient(mockFetch, TOKEN, "https://api.github.com", { sleepFn });
}

// ---------------------------------------------------------------------------
// TC-RC-001: X-GitHub-Api-Version header present on every request
// ---------------------------------------------------------------------------
describe("TC-RC-001: X-GitHub-Api-Version header", () => {
  it("sends X-GitHub-Api-Version: 2022-11-28 on every request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(okRefShaResponse());
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await client.getRefSha(OWNER, REPO, BRANCH);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});

// ---------------------------------------------------------------------------
// TC-RC-002: Authorization header in correct format
// ---------------------------------------------------------------------------
describe("TC-RC-002: Authorization: token header", () => {
  it("sends Authorization: token <token> header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(okRefShaResponse());
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await client.getRefSha(OWNER, REPO, BRANCH);

    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`token ${TOKEN}`);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-003: 401 → immediate throw, no retry
// ---------------------------------------------------------------------------
describe("TC-RC-003: 401 → throw immediately, no retry", () => {
  it("throws GITHUB_TOKEN_EXPIRED and does not retry on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(401, { message: "Bad credentials" }),
    );
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(client.getRefSha(OWNER, REPO, BRANCH)).rejects.toMatchObject({
      code: ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    });

    // Only 1 call — no retry on 401
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RC-004: 429 → wait Retry-After seconds, then retry
// ---------------------------------------------------------------------------
describe("TC-RC-004: 429 → wait Retry-After then retry", () => {
  it("waits Retry-After seconds when 429 is received, then retries", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(429, {}, { "Retry-After": "5" }),
      )
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.getRefSha(OWNER, REPO, BRANCH);
    expect(result).toBe(SHA);

    // Two fetch calls: 429 + success
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // sleepFn called with 5 * 1000 = 5000ms
    expect(sleepFn).toHaveBeenCalledWith(5000);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-005: Retry-After capped at 60 seconds
// ---------------------------------------------------------------------------
describe("TC-RC-005: Retry-After 60s cap", () => {
  it("caps Retry-After wait at 60 seconds when header is > 60", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(429, {}, { "Retry-After": "120" }),
      )
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await client.getRefSha(OWNER, REPO, BRANCH);

    // sleepFn must be called with exactly 60 * 1000 = 60000ms (capped)
    expect(sleepFn).toHaveBeenCalledWith(60_000);
  });

  it("uses 60s default when Retry-After header is absent", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, {}))
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await client.getRefSha(OWNER, REPO, BRANCH);

    expect(sleepFn).toHaveBeenCalledWith(60_000);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-006: 2xx + X-RateLimit-Remaining:0 → returned immediately (no rate-limit retry)
// The X-RateLimit-Remaining:0 retry block was removed (T-01). A successful response is
// returned to the caller regardless of rate-limit headers.
// ---------------------------------------------------------------------------
describe("TC-RC-006: 2xx + X-RateLimit-Remaining:0 → returned immediately", () => {
  it("returns 200 result immediately when X-RateLimit-Remaining is 0 (GET)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { object: { sha: SHA } }, { "X-RateLimit-Remaining": "0" }),
    );
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.getRefSha(OWNER, REPO, BRANCH);

    expect(result).toBe(SHA);
    // Exactly 1 fetch — no rate-limit retry
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No sleep — rate-limit wait was removed
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("also returns immediately when X-RateLimit-Remaining:0 + X-RateLimit-Reset header present", async () => {
    const resetEpoch = Math.floor((Date.now() + 30_000) / 1000);
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { object: { sha: SHA } }, {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetEpoch),
      }),
    );
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.getRefSha(OWNER, REPO, BRANCH);

    expect(result).toBe(SHA);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RC-007: 5xx → exponential backoff, succeeds on eventual 200
// ---------------------------------------------------------------------------
describe("TC-RC-007: 5xx exponential backoff succeeds", () => {
  it("retries twice on 5xx and returns result on 3rd attempt (200)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503, {}))
      .mockResolvedValueOnce(makeResponse(500, {}))
      .mockResolvedValueOnce(okBranchResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.verifyBranch(OWNER, REPO, BRANCH);
    expect(result).toBe(true);

    // 3 fetch calls total
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // 2 sleep calls (after attempt 0 and attempt 1)
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("uses increasing delays (exponential backoff) between retries", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503, {}))
      .mockResolvedValueOnce(makeResponse(503, {}))
      .mockResolvedValueOnce(okBranchResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await client.verifyBranch(OWNER, REPO, BRANCH);

    const [delay0] = sleepFn.mock.calls[0] as [number];
    const [delay1] = sleepFn.mock.calls[1] as [number];
    // attempt=0: ~1000-1500ms; attempt=1: ~2000-2500ms → delay1 > delay0
    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeGreaterThan(delay0);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-008: 5xx retry exhausted → throws GITHUB_API_ERROR
// ---------------------------------------------------------------------------
describe("TC-RC-008: 5xx retry exhausted → throw", () => {
  it("throws GITHUB_API_ERROR after 3 retries (4 total attempts) on persistent 5xx", async () => {
    // 4 responses: initial + 3 retries
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeResponse(503, {}));

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(client.verifyBranch(OWNER, REPO, BRANCH)).rejects.toMatchObject({
      code: ERROR_CODES.GITHUB_API_ERROR,
    });

    // 4 total fetch calls (initial + 3 retries)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // 3 sleep calls (before each retry)
    expect(sleepFn).toHaveBeenCalledTimes(3);
  });

  it("throws GITHUB_API_ERROR after exhaustion via getRefSha too", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(502, {}));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(client.getRefSha(OWNER, REPO, BRANCH)).rejects.toMatchObject({
      code: ERROR_CODES.GITHUB_API_ERROR,
    });

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-009: 429 retry exhausted → throws GITHUB_API_ERROR
// ---------------------------------------------------------------------------
describe("TC-RC-009: 429 retry exhausted → throw", () => {
  it("throws GITHUB_API_ERROR after 5 retries (6 total attempts) on persistent 429", async () => {
    // 6 responses: initial + 5 retries → all 429
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeResponse(429, {}, { "Retry-After": "1" }));

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(client.getRefSha(OWNER, REPO, BRANCH)).rejects.toMatchObject({
      code: ERROR_CODES.GITHUB_API_ERROR,
    });

    // 6 total fetch calls (initial + 5 retries)
    expect(mockFetch).toHaveBeenCalledTimes(6);
    // sleepFn called 5 times (once per retry, before the 6th call which throws)
    expect(sleepFn).toHaveBeenCalledTimes(5);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-010: 200 + X-RateLimit-Remaining:0 → returned immediately (not retried)
// After T-01 removed the rate-limit retry block, a 200 with Remaining:0 is returned
// to the caller. getRefSha should succeed with the SHA from the single response.
// ---------------------------------------------------------------------------
describe("TC-RC-010: 200 + X-RateLimit-Remaining:0 → returned immediately", () => {
  it("returns SHA from 200 response with Remaining:0, fetchFn called once", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(
        200,
        { object: { sha: SHA } },
        { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "0" },
      ),
    );

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.getRefSha(OWNER, REPO, BRANCH);
    expect(result).toBe(SHA);
    // Exactly 1 fetch — no rate-limit retry
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// Note: TC-RC-011 (429 + rate-limit mixed exhaustion) has been removed.
// The X-RateLimit-Remaining:0 retry block was eliminated in T-01, so the shared
// attempt429 counter is no longer incremented by rate-limit responses. The 429
// exhaustion path is fully covered by TC-RC-009.

// ---------------------------------------------------------------------------
// TC-RC-012: POST 201 + X-RateLimit-Remaining:0 → returned immediately (T-01)
// ---------------------------------------------------------------------------
describe("TC-RC-012: POST 201 + X-RateLimit-Remaining:0 → returned immediately", () => {
  it("returns 201 result immediately without re-fire on rate-limit header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(
        201,
        { id: 99, html_url: "https://github.com/testowner/testrepo/issues/1#issuecomment-99" },
        { "X-RateLimit-Remaining": "0" },
      ),
    );
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.createIssueComment(OWNER, REPO, 1, "hello");

    expect(result.id).toBe(99);
    // Exactly 1 fetch — no rate-limit re-fire
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No sleep called for rate-limit or any other reason
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RC-013: POST 500 → immediate throw, no retry (T-02)
// GET 5xx retries are unaffected (TC-RC-007 / TC-RC-008 confirm this).
// ---------------------------------------------------------------------------
describe("TC-RC-013: POST 500 → immediate throw, no retry", () => {
  it("throws GITHUB_API_ERROR after exactly 1 fetch for POST 5xx, no backoff sleep", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500, {}));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(
      client.createIssueComment(OWNER, REPO, 1, "hello"),
    ).rejects.toMatchObject({ code: ERROR_CODES.GITHUB_API_ERROR });

    // POST must not retry on 5xx — exactly 1 fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No backoff sleep for non-retried POST
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RC-014: PUT 502 → immediate throw, no retry (T-02)
// ---------------------------------------------------------------------------
describe("TC-RC-014: PUT 502 → immediate throw, no retry", () => {
  it("throws GITHUB_API_ERROR after exactly 1 fetch for PUT 5xx, no backoff sleep", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(502, {}));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await expect(
      client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" }),
    ).rejects.toMatchObject({ code: ERROR_CODES.GITHUB_API_ERROR });

    // PUT must not retry on 5xx — exactly 1 fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No backoff sleep for non-retried PUT (neither from request() nor from retryWithBackoff)
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RC-016: Retry-After HTTP-date ~30s future → sleepFn in [25_000, 60_000] (T-06)
// ---------------------------------------------------------------------------
describe("TC-RC-016: Retry-After HTTP-date future → sleepFn in [25_000, 60_000]", () => {
  it("sleeps for ~30s when Retry-After is an HTTP-date 30s in the future", async () => {
    const futureDate = new Date(Date.now() + 30_000).toUTCString();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, {}, { "Retry-After": futureDate }))
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    const result = await client.getRefSha(OWNER, REPO, BRANCH);
    expect(result).toBe(SHA);

    expect(sleepFn).toHaveBeenCalledTimes(1);
    const [sleepMs] = sleepFn.mock.calls[0] as [number];
    // Should be close to 30s, capped at 60s
    expect(sleepMs).toBeGreaterThanOrEqual(25_000);
    expect(sleepMs).toBeLessThanOrEqual(60_000);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-017: Retry-After garbage → sleepFn(60_000) fallback (T-06)
// ---------------------------------------------------------------------------
describe("TC-RC-017: Retry-After garbage → sleepFn(60_000) fallback", () => {
  it("uses 60s safe fallback for unparseable Retry-After value", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, {}, { "Retry-After": "garbage" }))
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await client.getRefSha(OWNER, REPO, BRANCH);

    expect(sleepFn).toHaveBeenCalledWith(60_000);
  });
});

// ---------------------------------------------------------------------------
// TC-RC-018: Retry-After HTTP-date in past → sleepFn(1_000) floor (T-06)
// ---------------------------------------------------------------------------
describe("TC-RC-018: Retry-After HTTP-date in past → sleepFn(1_000) floor", () => {
  it("uses 1s floor when Retry-After HTTP-date is already in the past", async () => {
    const pastDate = new Date(Date.now() - 5_000).toUTCString();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, {}, { "Retry-After": pastDate }))
      .mockResolvedValueOnce(okRefShaResponse());

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch as unknown as typeof fetch, sleepFn);

    await client.getRefSha(OWNER, REPO, BRANCH);

    // Past HTTP-date → Math.max(delay, 1) → 1s minimum, not 0 or negative
    expect(sleepFn).toHaveBeenCalledWith(1_000);
  });
});
