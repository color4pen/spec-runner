/**
 * Direct unit tests for GitHubApiClient.getRefSha.
 *
 * Aligns adapter behavior with the GitHubClient port contract:
 *   - 200  → returns object.sha
 *   - 404  → returns null
 *   - 401  → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
 *   - 5xx  → throws SpecRunnerError(GITHUB_API_ERROR)
 *   - 200 with malformed body → throws SpecRunnerError(GITHUB_API_ERROR)
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";

const OWNER = "testowner";
const REPO = "testrepo";
const BRANCH = "feat/test";
const SHA = "0123456789abcdef0123456789abcdef01234567";

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", { sleepFn: () => Promise.resolve() });
}

/** Minimal headers stub — returns null for all rate-limit headers. */
const mockHeaders = { get: vi.fn().mockReturnValue(null) };

describe("GitHubApiClient.getRefSha — 200 returns object.sha", () => {
  it("returns the SHA when GitHub responds 200 with a well-formed body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: mockHeaders,
      json: () => Promise.resolve({ ref: `refs/heads/${BRANCH}`, object: { sha: SHA, type: "commit" } }),
    });

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getRefSha(OWNER, REPO, BRANCH);

    expect(result).toBe(SHA);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain(`/repos/${OWNER}/${REPO}/git/refs/heads/`);
    expect(calledUrl).toContain(encodeURIComponent(BRANCH));
  });
});

describe("GitHubApiClient.getRefSha — 404 returns null", () => {
  it("returns null when the branch ref does not exist", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      headers: mockHeaders,
      json: () => Promise.resolve({ message: "Not Found" }),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);
    const result = await client.getRefSha(OWNER, REPO, BRANCH);

    expect(result).toBeNull();
  });
});

describe("GitHubApiClient.getRefSha — 401 throws GITHUB_TOKEN_EXPIRED", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_EXPIRED on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ message: "Bad credentials" }),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.getRefSha(OWNER, REPO, BRANCH),
    ).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });
  });
});

describe("GitHubApiClient.getRefSha — 5xx throws GITHUB_API_ERROR", () => {
  it("throws SpecRunnerError with GITHUB_API_ERROR on 503", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 503,
      headers: mockHeaders,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.getRefSha(OWNER, REPO, BRANCH),
    ).rejects.toMatchObject({ code: "GITHUB_API_ERROR" });
  });
});

describe("GitHubApiClient.getRefSha — malformed 200 body throws GITHUB_API_ERROR", () => {
  it("throws when object.sha is missing or not a string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: mockHeaders,
      json: () => Promise.resolve({ ref: `refs/heads/${BRANCH}` }), // no object.sha
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.getRefSha(OWNER, REPO, BRANCH),
    ).rejects.toMatchObject({ code: "GITHUB_API_ERROR" });
  });

  it("throws when object.sha is empty string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: mockHeaders,
      json: () => Promise.resolve({ object: { sha: "" } }),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.getRefSha(OWNER, REPO, BRANCH),
    ).rejects.toMatchObject({ code: "GITHUB_API_ERROR" });
  });
});
