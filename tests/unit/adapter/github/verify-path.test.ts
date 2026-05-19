/**
 * Direct unit tests for GitHubApiClient.verifyPath.
 *
 * Aligns adapter behavior with the GitHubClient port contract:
 *   - 200  → true
 *   - 404  → false
 *   - 401  → throws SpecRunnerError(GITHUB_TOKEN_EXPIRED)
 *   - 5xx  → throws SpecRunnerError(GITHUB_API_ERROR)
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { changeFolderPath } from "../../../../src/util/paths.js";

const OWNER = "testowner";
const REPO = "testrepo";
const BRANCH = "feat/test";
const FOLDER_PATH = changeFolderPath("test-slug");

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", { sleepFn: () => Promise.resolve() });
}

/** Minimal headers stub — returns null for all rate-limit headers. */
const mockHeaders = { get: vi.fn().mockReturnValue(null) };

describe("GitHubApiClient.verifyPath — 200 returns true", () => {
  it("returns true when GitHub responds 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: mockHeaders,
      text: () => Promise.resolve("[]"),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);
    const result = await client.verifyPath(OWNER, REPO, BRANCH, FOLDER_PATH);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("GitHubApiClient.verifyPath — 404 returns false", () => {
  it("returns false when GitHub responds 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      headers: mockHeaders,
      text: () => Promise.resolve(""),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);
    const result = await client.verifyPath(OWNER, REPO, BRANCH, FOLDER_PATH);

    expect(result).toBe(false);
  });
});

describe("GitHubApiClient.verifyPath — 401 throws GITHUB_TOKEN_EXPIRED", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_EXPIRED code on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(""),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.verifyPath(OWNER, REPO, BRANCH, FOLDER_PATH),
    ).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });
  });
});

describe("GitHubApiClient.verifyPath — 5xx throws GITHUB_API_ERROR", () => {
  it("throws SpecRunnerError with GITHUB_API_ERROR code on 503", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 503,
      headers: mockHeaders,
      text: () => Promise.resolve(""),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.verifyPath(OWNER, REPO, BRANCH, FOLDER_PATH),
    ).rejects.toMatchObject({ code: "GITHUB_API_ERROR" });
  });
});
