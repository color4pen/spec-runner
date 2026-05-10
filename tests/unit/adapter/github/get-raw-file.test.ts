/**
 * TC-012/013/014/015: Direct unit tests for GitHubApiClient.getRawFile.
 *
 * Rewritten from tests/spec-review-fetch.test.ts (deleted in 2026-04-30-port-tidying).
 * These test the GitHubApiClient adapter directly, covering retry / 404 / 401 / 200
 * semantics equivalent to the deleted spec-review fetch helper.
 *
 * Assertion mapping (old scenario → new test):
 *   TC-012: 200 on first try  → getRawFile 200 first try
 *   TC-013: 404×2 then 200    → getRawFile 404×2 then 200
 *   TC-014: all 404 → null    → getRawFile all 404 → null
 *   TC-015: 401 → GITHUB_TOKEN_EXPIRED → getRawFile 401 → GITHUB_TOKEN_EXPIRED
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { specReviewResultPath } from "../../../../src/util/paths.js";

const OWNER = "testowner";
const REPO = "testrepo";
const BRANCH = "feat/test";
const FILE_PATH = specReviewResultPath("test-slug", 1);

function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test");
}

// TC-012: getRawFile — 正常取得（200）
describe("TC-012: GitHubApiClient.getRawFile — success on first try (200)", () => {
  it("returns file content without retrying when first call returns 200", async () => {
    const fileContent = "- **verdict**: approved\n\n## Findings\nNone.";
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    }) as unknown as typeof fetch;

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch);

    const result = await client.getRawFile(OWNER, REPO, BRANCH, FILE_PATH, { sleepFn });

    expect(result).toBe(fileContent);
    // No retries — called once
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// TC-013: getRawFile — 404 を受け取った場合に 1 秒待機して再試行する
describe("TC-013: GitHubApiClient.getRawFile — retries on 404, succeeds on 3rd attempt", () => {
  it("returns file content after retrying twice with 1s sleep each time", async () => {
    const fileContent = "- **verdict**: approved";
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ status: 404, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ status: 404, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve(fileContent) }) as unknown as typeof fetch;

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch);

    const result = await client.getRawFile(OWNER, REPO, BRANCH, FILE_PATH, { sleepFn });

    expect(result).toBe(fileContent);
    // sleepFn called twice (before attempt 2 and attempt 3)
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(1000);
  });
});

// TC-014: getRawFile — 3 回リトライしても 404 の場合は null を返す
describe("TC-014: GitHubApiClient.getRawFile — returns null after 3 retries exhausted", () => {
  it("returns null and sleeps 3 times when all 4 calls return 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(""),
    }) as unknown as typeof fetch;

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const client = buildClient(mockFetch);

    const result = await client.getRawFile(OWNER, REPO, BRANCH, FILE_PATH, { sleepFn });

    expect(result).toBeNull();
    // 3 retries = 3 sleeps (before attempt 2, 3, 4)
    expect(sleepFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledWith(1000);
    // Total of 4 fetch calls (attempt 0 + 3 retries)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// TC-015: getRawFile — 401 は SpecRunnerError を投げる
describe("TC-015: GitHubApiClient.getRawFile — throws GITHUB_TOKEN_EXPIRED on 401", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_EXPIRED code on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(""),
    }) as unknown as typeof fetch;

    const client = buildClient(mockFetch);

    await expect(
      client.getRawFile(OWNER, REPO, BRANCH, FILE_PATH),
    ).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });
  });
});
