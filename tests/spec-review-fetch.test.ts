/**
 * TC-012/013/014/015: Direct unit tests for fetchSpecReviewResult.
 * These test the fetchSpecReviewResult helper directly (via raw fetch mock).
 * These are NOT integration tests of the executor's production path, which
 * uses githubClient.getRawFile exclusively.
 */
import { describe, it, expect, vi } from "vitest";
import { fetchSpecReviewResult } from "../src/core/step/spec-review.js";
import type { FetchSpecReviewResultParams } from "../src/core/step/spec-review.js";

function buildDeps(overrides: Partial<FetchSpecReviewResultParams> = {}): FetchSpecReviewResultParams {
  return {
    config: {
      github: { accessToken: "ghp_test" },
    },
    repo: { owner: "testowner", name: "testrepo" },
    sleepFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// TC-012: fetchSpecReviewResult — 正常取得（200）
describe("TC-012: fetchSpecReviewResult — success on first try (200)", () => {
  it("returns file content without retrying when first call returns 200", async () => {
    const fileContent = "- **verdict**: approved\n\n## Findings\nNone.";
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    });
    const deps = buildDeps({ githubFetch: mockFetch });

    const result = await fetchSpecReviewResult(deps, "test-slug", "feat/test", 1);

    expect(result).toBe(fileContent);
    // No retries — called once
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(deps.sleepFn).not.toHaveBeenCalled();
  });
});

// TC-013: fetchSpecReviewResult — 404 を受け取った場合に 1 秒待機して再試行する
describe("TC-013: fetchSpecReviewResult — retries on 404, succeeds on 3rd attempt", () => {
  it("returns file content after retrying twice with 1s sleep each time", async () => {
    const fileContent = "- **verdict**: approved";
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ status: 404, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ status: 404, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve(fileContent) });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({ githubFetch: mockFetch, sleepFn });

    const result = await fetchSpecReviewResult(deps, "test-slug", "feat/test", 1);

    expect(result).toBe(fileContent);
    // sleepFn called twice (before attempt 2 and attempt 3)
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(1000);
  });
});

// TC-014: fetchSpecReviewResult — 3 回リトライしても 404 の場合は null を返す
describe("TC-014: fetchSpecReviewResult — returns null after 3 retries exhausted", () => {
  it("returns null and sleeps 3 times when all 4 calls return 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      text: () => Promise.resolve(""),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({ githubFetch: mockFetch, sleepFn });

    const result = await fetchSpecReviewResult(deps, "test-slug", "feat/test", 1);

    expect(result).toBeNull();
    // 3 retries = 3 sleeps (before attempt 2, 3, 4)
    expect(sleepFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledWith(1000);
  });
});

// TC-015: fetchSpecReviewResult — 401 は SpecRunnerError を投げる（should）
describe("TC-015: fetchSpecReviewResult — throws GITHUB_TOKEN_EXPIRED on 401", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_EXPIRED code on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      text: () => Promise.resolve(""),
    });

    const deps = buildDeps({ githubFetch: mockFetch });

    await expect(
      fetchSpecReviewResult(deps, "test-slug", "feat/test", 1),
    ).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });
  });
});
