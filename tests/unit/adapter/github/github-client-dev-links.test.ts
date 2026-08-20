/**
 * Unit tests for GitHubApiClient.listIssueLinkedBranches.
 *
 * TC-017: unions linkedBranches and closedByPullRequestsReferences with deduplication
 * TC-018: throws GITHUB_API_ERROR on non-2xx HTTP response
 * TC-019: throws GITHUB_API_ERROR on GraphQL errors field non-empty
 * TC-026: returns empty array when issue has no linked branches or PRs
 * + null issue (TC-T01 acceptance: HTTP 200 + repository.issue: null) throws GITHUB_API_ERROR
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";

const noopSleep = () => Promise.resolve();

function buildClient(mockFetch: typeof fetch, baseUrl = "https://api.github.com"): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", baseUrl, { sleepFn: noopSleep });
}

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function makeLinkedBranchesResponse(
  linkedBranches: string[],
  closedByPRHeads: string[],
): object {
  return {
    data: {
      repository: {
        issue: {
          linkedBranches: {
            nodes: linkedBranches.map((name) => ({ ref: { name } })),
          },
          closedByPullRequestsReferences: {
            nodes: closedByPRHeads.map((headRefName) => ({ headRefName })),
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// TC-017: unions both sources with deduplication
// ---------------------------------------------------------------------------

describe("TC-017: listIssueLinkedBranches unions linkedBranches and closedByPullRequestsReferences", () => {
  it("TC-017: returns union of both sources with deduplication", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, makeLinkedBranchesResponse(["B1"], ["B2", "B1"])),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listIssueLinkedBranches("owner", "repo", 5);

    expect(result).toHaveLength(2);
    expect(result).toContain("B1");
    expect(result).toContain("B2");
  });

  it("TC-017: linkedBranches ref appears before closedByPR duplicates", async () => {
    // B1 comes from linkedBranches (first source), B2 from closedByPR only
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, makeLinkedBranchesResponse(["B1"], ["B2", "B1"])),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listIssueLinkedBranches("owner", "repo", 5);
    // B1 appears exactly once (deduplicated)
    expect(result.filter((b) => b === "B1")).toHaveLength(1);
  });

  it("TC-017: POST to /graphql endpoint with correct variables", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, makeLinkedBranchesResponse([], [])),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.listIssueLinkedBranches("myowner", "myrepo", 42);

    const [url, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
    expect(body.variables["owner"]).toBe("myowner");
    expect(body.variables["repo"]).toBe("myrepo");
    expect(body.variables["number"]).toBe(42);
    expect(body.query).toContain("linkedBranches");
    expect(body.query).toContain("closedByPullRequestsReferences");
  });
});

// ---------------------------------------------------------------------------
// TC-018: throws GITHUB_API_ERROR on non-2xx HTTP response
// ---------------------------------------------------------------------------

describe("TC-018: listIssueLinkedBranches throws GITHUB_API_ERROR on non-2xx", () => {
  it("TC-018: 500 response throws GITHUB_API_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500, { message: "Server Error" }));
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.listIssueLinkedBranches("owner", "repo", 5),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });

  it("TC-018: 404 response throws GITHUB_API_ERROR (not silently [])", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(404, { message: "Not Found" }));
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.listIssueLinkedBranches("owner", "repo", 5),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-019: throws GITHUB_API_ERROR on GraphQL errors field non-empty
// ---------------------------------------------------------------------------

describe("TC-019: listIssueLinkedBranches throws GITHUB_API_ERROR on GraphQL errors", () => {
  it("TC-019: HTTP 200 with errors array throws GITHUB_API_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { errors: [{ message: "Some GraphQL error" }] }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.listIssueLinkedBranches("owner", "repo", 5),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-026: returns empty array when issue has no linked branches or PRs
// ---------------------------------------------------------------------------

describe("TC-026: listIssueLinkedBranches returns [] when both sources are empty", () => {
  it("TC-026: empty nodes in both fields returns []", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, makeLinkedBranchesResponse([], [])),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listIssueLinkedBranches("owner", "repo", 5);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// null issue: HTTP 200 + repository.issue: null → GITHUB_API_ERROR
// ---------------------------------------------------------------------------

describe("listIssueLinkedBranches: null issue throws GITHUB_API_ERROR (not [])", () => {
  it("HTTP 200 with repository.issue null throws GITHUB_API_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { data: { repository: { issue: null } } }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.listIssueLinkedBranches("owner", "repo", 9999),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});
