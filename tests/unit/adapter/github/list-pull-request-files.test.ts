/**
 * Unit tests for GitHubApiClient.listPullRequestFiles
 *
 * TC-LPF-001: Single-page response returns all filenames with truncated: false
 * TC-LPF-002: Multi-page response follows Link: rel="next" and returns union with truncated: false
 * TC-LPF-003: Response that reaches 3000-file cap returns truncated: true
 * TC-LPF-004: Non-200 status throws githubApiError
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";

const OWNER = "testowner";
const REPO = "testrepo";
const PR_NUMBER = 42;

const noopSleep = () => Promise.resolve();

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", "https://api.github.com", { sleepFn: noopSleep });
}

/** Build a JSON response for file list pages. */
function filesResponse(
  files: string[],
  status = 200,
  nextLink?: string,
): Response {
  const body = files.map((filename) => ({ filename, status: "modified" }));
  const headers = new Map<string, string>();
  headers.set("X-RateLimit-Remaining", "100");
  if (nextLink) {
    headers.set("Link", `<${nextLink}>; rel="next"`);
  }
  return {
    status,
    headers: { get: (key: string) => headers.get(key) ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// TC-LPF-001: Single-page response
// ---------------------------------------------------------------------------

describe("TC-LPF-001: single-page response returns all filenames with truncated: false", () => {
  it("returns filenames from a single page", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      filesResponse([".github/workflows/ci.yml", "src/foo.ts"]),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listPullRequestFiles(OWNER, REPO, PR_NUMBER);

    expect(result.files).toEqual([".github/workflows/ci.yml", "src/foo.ts"]);
    expect(result.truncated).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns empty files array for a PR with no changed files", async () => {
    const mockFetch = vi.fn().mockResolvedValue(filesResponse([]));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listPullRequestFiles(OWNER, REPO, PR_NUMBER);

    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-LPF-002: Multi-page response follows Link: rel="next"
// ---------------------------------------------------------------------------

describe("TC-LPF-002: multi-page response follows Link header and returns union", () => {
  it("collects filenames from two pages via Link: rel=next", async () => {
    const page1Files = Array.from({ length: 3 }, (_, i) => `src/file-page1-${i}.ts`);
    const page2Files = Array.from({ length: 2 }, (_, i) => `src/file-page2-${i}.ts`);

    const page2Url = "https://api.github.com/repos/testowner/testrepo/pulls/42/files?per_page=100&page=2";

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(filesResponse(page1Files, 200, page2Url))
      .mockResolvedValueOnce(filesResponse(page2Files));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listPullRequestFiles(OWNER, REPO, PR_NUMBER);

    expect(result.files).toEqual([...page1Files, ...page2Files]);
    expect(result.truncated).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should use the next page URL
    expect(mockFetch).toHaveBeenNthCalledWith(2, page2Url, expect.anything());
  });
});

// ---------------------------------------------------------------------------
// TC-LPF-003: 3000-file cap → truncated: true
// ---------------------------------------------------------------------------

describe("TC-LPF-003: reaching the 3000-file cap returns truncated: true", () => {
  it("returns truncated: true when exactly 3000 files are collected", async () => {
    // Build a page of 3000 files (simulating the cap being reached)
    const files3000 = Array.from({ length: 3000 }, (_, i) => `src/file-${i}.ts`);
    const page2Url = "https://api.github.com/repos/testowner/testrepo/pulls/42/files?per_page=100&page=31";

    // Page with 3000 files and a "next" link (indicating more exist)
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(filesResponse(files3000, 200, page2Url));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listPullRequestFiles(OWNER, REPO, PR_NUMBER);

    expect(result.truncated).toBe(true);
    expect(result.files).toHaveLength(3000);
    // Should NOT fetch the second page (detected truncation after first page)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns truncated: true when accumulated files exceed 3000", async () => {
    // First page: 2990 files, second page adds 20 more → total 3010 → truncated
    const page1Files = Array.from({ length: 2990 }, (_, i) => `src/page1-${i}.ts`);
    const page2Files = Array.from({ length: 20 }, (_, i) => `src/page2-${i}.ts`);
    const page2Url = "https://api.github.com/repos/testowner/testrepo/pulls/42/files?per_page=100&page=2";

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(filesResponse(page1Files, 200, page2Url))
      .mockResolvedValueOnce(filesResponse(page2Files));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.listPullRequestFiles(OWNER, REPO, PR_NUMBER);

    expect(result.truncated).toBe(true);
    expect(result.files.length).toBe(3010);
  });
});

// ---------------------------------------------------------------------------
// TC-LPF-004: Non-200 status throws githubApiError
// ---------------------------------------------------------------------------

describe("TC-LPF-004: non-200 status throws githubApiError", () => {
  it("throws on 404 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(filesResponse([], 404));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await expect(client.listPullRequestFiles(OWNER, REPO, PR_NUMBER)).rejects.toThrow();
  });

  it("throws on 403 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(filesResponse([], 403));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await expect(client.listPullRequestFiles(OWNER, REPO, PR_NUMBER)).rejects.toThrow();
  });
});
