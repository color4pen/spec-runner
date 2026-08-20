/**
 * Unit tests for GitHubApiClient GraphQL operations.
 *
 * TC-016: createLinkedBranch posts the GraphQL mutation with issueId / name / oid
 * TC-017: createLinkedBranch fails closed (non-2xx and GraphQL errors throw)
 * TC-018: GraphQL endpoint is derived correctly for github.com and GHES
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

// ---------------------------------------------------------------------------
// TC-016: createLinkedBranch posts the GraphQL mutation
// ---------------------------------------------------------------------------

describe("TC-016: createLinkedBranch — GraphQL mutation が正しく POST される", () => {
  it("TC-016: POST to /graphql endpoint with issueId, name, oid in variables", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { data: { createLinkedBranch: { linkedBranch: { id: "LB_1" } } } }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.createLinkedBranch("ISSUE_NODE_ID", "feat/my-slug-abcdef01", "abc123sha");

    const [url, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as { query: string; variables: Record<string, string> };
    expect(body.variables["issueId"]).toBe("ISSUE_NODE_ID");
    expect(body.variables["name"]).toBe("feat/my-slug-abcdef01");
    expect(body.variables["oid"]).toBe("abc123sha");
    expect(body.query).toContain("createLinkedBranch");
  });
});

// ---------------------------------------------------------------------------
// TC-017: createLinkedBranch fails closed
// ---------------------------------------------------------------------------

describe("TC-017: createLinkedBranch — fail-closed at the adapter", () => {
  it("TC-017: non-2xx response throws GITHUB_API_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500, { message: "Server Error" }));
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.createLinkedBranch("ISSUE_NODE", "branch", "oid"),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });

  it("TC-017: GraphQL errors non-empty throws GITHUB_API_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { errors: [{ message: "Issue not found" }] }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.createLinkedBranch("ISSUE_NODE", "branch", "oid"),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-018: GraphQL endpoint derivation
// ---------------------------------------------------------------------------

describe("TC-018: GraphQL endpoint が正しく導出される", () => {
  it("TC-018: https://api.github.com → https://api.github.com/graphql", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { data: { createLinkedBranch: { linkedBranch: { id: "X" } } } }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch, "https://api.github.com");
    await client.createLinkedBranch("ID", "branch", "oid");

    const [url] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://api.github.com/graphql");
  });

  it("TC-018: https://HOST/api/v3 → https://HOST/api/graphql (GHES)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { data: { createLinkedBranch: { linkedBranch: { id: "X" } } } }),
    );
    const client = buildClient(mockFetch as unknown as typeof fetch, "https://github.example.com/api/v3");
    await client.createLinkedBranch("ID", "branch", "oid");

    const [url] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://github.example.com/api/graphql");
  });
});
