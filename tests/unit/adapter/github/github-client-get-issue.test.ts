/**
 * Unit tests for GitHubApiClient.getIssue (TC-009, TC-010, TC-013)
 *
 * TC-009: getIssue 200 応答 — endpoint / 認証 header / null body 射影
 *   Source: spec.md > Requirement: getIssue は単一 issue の title / body を返す
 *           > Scenario: 200 応答の射影
 *
 * TC-010: getIssue 404 — GITHUB_API_ERROR を throw（null を返さない）
 *   Source: spec.md > Requirement: getIssue は単一 issue の title / body を返す
 *           > Scenario: 非 200 はエラーに変換
 *
 * TC-013: getIssue 401 — GITHUB_TOKEN_EXPIRED を throw
 *   Source: tasks.md > T-01
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";
import { SpecRunnerError, ERROR_CODES } from "../../../../src/errors.js";

const OWNER = "testowner";
const REPO = "testrepo";
const ISSUE_NUMBER = 875;

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
// TC-009: 200 応答の射影
// ---------------------------------------------------------------------------

describe("TC-009: getIssue — 200 応答の射影", () => {
  it("TC-009: endpoint は /repos/{owner}/{repo}/issues/{n} で認証 header が付与される", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        number: ISSUE_NUMBER,
        title: "issue 起点 run の開始前忠実性ゲート",
        body: "Issue body content",
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.getIssue(OWNER, REPO, ISSUE_NUMBER);

    const [url, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}`);
    expect(init.method).toBeUndefined(); // GET は method 省略
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/token /);
    expect(headers["Accept"]).toBeTruthy();
    expect(headers["X-GitHub-Api-Version"]).toBeTruthy();
  });

  it("TC-009: 返り値は { number, title, body } を含む", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        number: ISSUE_NUMBER,
        title: "Test Issue Title",
        body: "Test body",
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getIssue(OWNER, REPO, ISSUE_NUMBER);

    expect(result.number).toBe(ISSUE_NUMBER);
    expect(result.title).toBe("Test Issue Title");
    expect(result.body).toBe("Test body");
  });

  it("TC-009: body が null の場合は空文字 '' に射影される", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        number: ISSUE_NUMBER,
        title: "Issue with null body",
        body: null,
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getIssue(OWNER, REPO, ISSUE_NUMBER);

    expect(result.body).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-010: 非 200 はエラーに変換（null を返さない）
// ---------------------------------------------------------------------------

describe("TC-010: getIssue — 非 200 はエラーに変換（GITHUB_API_ERROR）", () => {
  it("TC-010: 404 で GITHUB_API_ERROR を throw する（null を返さない）", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(404, { message: "Not Found" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.getIssue(OWNER, REPO, ISSUE_NUMBER),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });

  it("TC-010: 500 で GITHUB_API_ERROR を throw する", async () => {
    // For 5xx on GET: retry then throw — mock exhausted retries by always returning 500
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(500, { message: "Internal Server Error" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.getIssue(OWNER, REPO, ISSUE_NUMBER),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_API_ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-013: getIssue 401 — GITHUB_TOKEN_EXPIRED を throw
// ---------------------------------------------------------------------------

describe("TC-013: getIssue — 401 は GITHUB_TOKEN_EXPIRED を throw する", () => {
  it("TC-013: GitHub API が 401 を返すとき GITHUB_TOKEN_EXPIRED error が throw される（null を返さない）", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(401, { message: "Bad credentials" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);

    await expect(
      client.getIssue(OWNER, REPO, ISSUE_NUMBER),
    ).rejects.toSatisfy((err: unknown) =>
      err instanceof SpecRunnerError && err.code === ERROR_CODES.GITHUB_TOKEN_EXPIRED,
    );
  });
});
