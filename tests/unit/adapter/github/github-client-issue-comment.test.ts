/**
 * Unit tests for GitHubApiClient.createIssueComment.
 *
 * TC-IC-001: 201 response → returns { id, url } from REST id / html_url
 * TC-IC-002: non-201 (404) → throws githubApiError
 * TC-IC-003: POST URL is /repos/{owner}/{repo}/issues/{issueNumber}/comments
 * TC-IC-004: request body contains { body }
 * TC-IC-005: 401 → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";

const OWNER = "testowner";
const REPO = "testrepo";
const ISSUE_NUMBER = 42;
const COMMENT_BODY = "This is a test comment";

const noopSleep = () => Promise.resolve();

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", "https://api.github.com", { sleepFn: noopSleep });
}

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// TC-IC-001: 201 → { id, url }
// ---------------------------------------------------------------------------

describe("TC-IC-001: createIssueComment — 201 response maps id and html_url", () => {
  it("returns { id, url } from REST id / html_url", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(201, {
        id: 999,
        html_url: "https://github.com/testowner/testrepo/issues/42#issuecomment-999",
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY);

    expect(result.id).toBe(999);
    expect(result.url).toBe("https://github.com/testowner/testrepo/issues/42#issuecomment-999");
  });
});

// ---------------------------------------------------------------------------
// TC-IC-002: non-201 → throws githubApiError
// ---------------------------------------------------------------------------

describe("TC-IC-002: createIssueComment — non-201 throws", () => {
  it("throws on 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(404, { message: "Not Found" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY),
    ).rejects.toThrow();
  });

  it("throws on 422 unprocessable", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(422, { message: "Unprocessable Entity" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-IC-003: POST URL contains correct path
// ---------------------------------------------------------------------------

describe("TC-IC-003: createIssueComment — POST URL is correct", () => {
  it("calls POST /repos/{owner}/{repo}/issues/{issueNumber}/comments", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(201, { id: 1, html_url: "https://github.com/o/r/issues/42#issuecomment-1" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY);

    const [url, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}/comments`);
    expect(init.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// TC-IC-004: request body contains { body }
// ---------------------------------------------------------------------------

describe("TC-IC-004: createIssueComment — request body is correct", () => {
  it("sends JSON body with 'body' field", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(201, { id: 1, html_url: "https://github.com/o/r/issues/42#issuecomment-1" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY);

    const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as { body: string };
    expect(parsed.body).toBe(COMMENT_BODY);
  });
});

// ---------------------------------------------------------------------------
// TC-IC-005: 401 → GITHUB_TOKEN_EXPIRED
// ---------------------------------------------------------------------------

describe("TC-IC-005: createIssueComment — 401 throws GITHUB_TOKEN_EXPIRED", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_EXPIRED on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(401, { message: "Bad credentials" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.createIssueComment(OWNER, REPO, ISSUE_NUMBER, COMMENT_BODY),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    );
  });
});
