/**
 * T-02 adapter tests: searchOpenIssuesByLabel and listIssueComments.
 *
 * TC-IL-001: searchOpenIssuesByLabel — returns only issues (PR excluded)
 * TC-IL-002: searchOpenIssuesByLabel — follows Link header pagination
 * TC-IL-003: searchOpenIssuesByLabel — normalizes null body to empty string
 * TC-IL-004: searchOpenIssuesByLabel — 401 → GITHUB_TOKEN_EXPIRED
 * TC-IL-005: searchOpenIssuesByLabel — non-200 → GITHUB_API_ERROR
 * TC-LC-001: listIssueComments — maps author_association and created_at
 * TC-LC-002: listIssueComments — follows Link header pagination
 * TC-LC-003: listIssueComments — 401 → GITHUB_TOKEN_EXPIRED
 * TC-LC-004: listIssueComments — non-200 → GITHUB_API_ERROR
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";

const OWNER = "testowner";
const REPO = "testrepo";
const noopSleep = () => Promise.resolve();

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", "https://api.github.com", { sleepFn: noopSleep });
}

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// searchOpenIssuesByLabel
// ---------------------------------------------------------------------------

describe("TC-IL-001: searchOpenIssuesByLabel — excludes pull requests", () => {
  it("returns only issues (pull_request field absent)", async () => {
    const issues = [
      { number: 1, title: "Issue 1", body: "body 1" },
      { number: 2, title: "Issue 2", body: null, pull_request: { url: "..." } }, // PR
      { number: 3, title: "Issue 3", body: "body 3" },
    ];
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, issues));
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.searchOpenIssuesByLabel(OWNER, REPO, "approved");

    expect(result).toHaveLength(2);
    expect(result[0]!.number).toBe(1);
    expect(result[1]!.number).toBe(3);
  });
});

describe("TC-IL-003: searchOpenIssuesByLabel — normalizes null body", () => {
  it("returns empty string when body is null", async () => {
    const issues = [{ number: 10, title: "No body", body: null }];
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, issues));
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.searchOpenIssuesByLabel(OWNER, REPO, "approved");

    expect(result[0]!.body).toBe("");
  });
});

describe("TC-IL-002: searchOpenIssuesByLabel — pagination", () => {
  it("follows Link header rel=next to fetch all pages", async () => {
    const page1 = [{ number: 1, title: "Issue 1", body: "body 1" }];
    const page2 = [{ number: 2, title: "Issue 2", body: "body 2" }];

    const resp1 = makeResponse(200, page1, {
      link: '<https://api.github.com/page2>; rel="next", <https://api.github.com/page2>; rel="last"',
    });
    const resp2 = makeResponse(200, page2);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(resp1)
      .mockResolvedValueOnce(resp2);

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.searchOpenIssuesByLabel(OWNER, REPO, "approved");

    expect(result).toHaveLength(2);
    expect(result[0]!.number).toBe(1);
    expect(result[1]!.number).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("TC-IL-004: searchOpenIssuesByLabel — 401 → GITHUB_TOKEN_EXPIRED", () => {
  it("throws GITHUB_TOKEN_EXPIRED on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(401, {}));
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(client.searchOpenIssuesByLabel(OWNER, REPO, "approved")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    );
  });
});

describe("TC-IL-005: searchOpenIssuesByLabel — non-200 → GITHUB_API_ERROR", () => {
  it("throws GITHUB_API_ERROR on 404", async () => {
    // need to prevent retry by mocking enough responses
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(404, { message: "not found" }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(client.searchOpenIssuesByLabel(OWNER, REPO, "approved")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// listIssueComments
// ---------------------------------------------------------------------------

describe("TC-LC-001: listIssueComments — maps author_association and created_at", () => {
  it("maps REST fields to camelCase output", async () => {
    const comments = [
      {
        id: 101,
        body: "Hello",
        author_association: "OWNER",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: 102,
        body: "/resume fix it",
        author_association: "COLLABORATOR",
        created_at: "2024-01-02T00:00:00Z",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, comments));
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listIssueComments(OWNER, REPO, 42);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 101,
      body: "Hello",
      authorAssociation: "OWNER",
      createdAt: "2024-01-01T00:00:00Z",
    });
    expect(result[1]).toEqual({
      id: 102,
      body: "/resume fix it",
      authorAssociation: "COLLABORATOR",
      createdAt: "2024-01-02T00:00:00Z",
    });
  });
});

describe("TC-LC-002: listIssueComments — pagination", () => {
  it("follows Link header rel=next to fetch all pages", async () => {
    const page1 = [
      { id: 1, body: "first", author_association: "MEMBER", created_at: "2024-01-01T00:00:00Z" },
    ];
    const page2 = [
      { id: 2, body: "second", author_association: "NONE", created_at: "2024-01-02T00:00:00Z" },
    ];

    const resp1 = makeResponse(200, page1, {
      link: '<https://api.github.com/page2>; rel="next"',
    });
    const resp2 = makeResponse(200, page2);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(resp1)
      .mockResolvedValueOnce(resp2);

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listIssueComments(OWNER, REPO, 42);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.id).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("TC-LC-003: listIssueComments — 401 → GITHUB_TOKEN_EXPIRED", () => {
  it("throws GITHUB_TOKEN_EXPIRED on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(401, {}));
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(client.listIssueComments(OWNER, REPO, 42)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    );
  });
});

describe("TC-LC-004: listIssueComments — non-200 → GITHUB_API_ERROR", () => {
  it("throws GITHUB_API_ERROR on 500", async () => {
    // 500 triggers retry; provide enough failure responses to exhaust retries
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(500, { message: "server error" }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(client.listIssueComments(OWNER, REPO, 42)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});
