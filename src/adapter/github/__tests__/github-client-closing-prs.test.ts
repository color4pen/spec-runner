/**
 * Unit tests for GitHubApiClient.listIssueClosingPullRequests
 *
 * Covers the four code paths in the adapter implementation:
 *   - happy path: returns mapped { number, headRefName }[] from GraphQL nodes
 *   - non-2xx HTTP → throws GITHUB_API_ERROR
 *   - GraphQL errors array non-empty → throws GITHUB_API_ERROR
 *   - null issue → throws GITHUB_API_ERROR
 */
import { describe, it, expect } from "vitest";
import { GitHubApiClient } from "../github-client.js";
import { SpecRunnerError, ERROR_CODES } from "../../../errors.js";

function makeClient(fetchFn: typeof globalThis.fetch): GitHubApiClient {
  return new GitHubApiClient(fetchFn, "tok", "https://api.github.com");
}

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return () =>
    Promise.resolve({
      status,
      json: () => Promise.resolve(body),
    } as Response);
}

describe("GitHubApiClient.listIssueClosingPullRequests", () => {
  it("returns mapped PR list on success", async () => {
    const client = makeClient(
      mockFetch(200, {
        data: {
          repository: {
            issue: {
              closedByPullRequestsReferences: {
                nodes: [
                  { number: 42, headRefName: "feat/my-feature" },
                  { number: 7, headRefName: "fix/bug" },
                ],
              },
            },
          },
        },
      }),
    );
    const result = await client.listIssueClosingPullRequests("owner", "repo", 5);
    expect(result).toEqual([
      { number: 42, headRefName: "feat/my-feature" },
      { number: 7, headRefName: "fix/bug" },
    ]);
  });

  it("returns empty array when nodes is empty", async () => {
    const client = makeClient(
      mockFetch(200, {
        data: {
          repository: {
            issue: { closedByPullRequestsReferences: { nodes: [] } },
          },
        },
      }),
    );
    const result = await client.listIssueClosingPullRequests("owner", "repo", 5);
    expect(result).toEqual([]);
  });

  it("throws GITHUB_API_ERROR on non-2xx HTTP status", async () => {
    const client = makeClient(mockFetch(503, {}));
    await expect(
      client.listIssueClosingPullRequests("owner", "repo", 5),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof SpecRunnerError && e.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });

  it("throws GITHUB_API_ERROR when GraphQL errors are present", async () => {
    const client = makeClient(
      mockFetch(200, { errors: [{ message: "oops" }], data: null }),
    );
    await expect(
      client.listIssueClosingPullRequests("owner", "repo", 5),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof SpecRunnerError && e.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });

  it("throws GITHUB_API_ERROR when issue is null", async () => {
    const client = makeClient(
      mockFetch(200, { data: { repository: { issue: null } } }),
    );
    await expect(
      client.listIssueClosingPullRequests("owner", "repo", 5),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof SpecRunnerError && e.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});
