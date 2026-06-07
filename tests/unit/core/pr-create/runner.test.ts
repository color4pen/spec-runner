/**
 * Unit tests for runPrCreate runner.
 *
 * TC-001: 既存 OPEN PR を検出して新規作成しない
 * TC-002: PR が存在しない場合に新規 PR を作成する
 * TC-003: 既存 MERGED PR の場合に error を返す
 * TC-004: gh CLI 失敗時に error を返す
 * TC-005: 既存 CLOSED PR の場合に error を返す
 * TC-006: --body フラグを使用しない（tempfile 経由）
 * TC-007: stderr 文言依存で PR 不在を判定しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";

function makeMockGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/owner/repo/pull/1", number: 1 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// TC-001: 既存 OPEN PR を検出して新規作成しない
describe("TC-001: runner — 既存 OPEN PR を検出して新規作成しない", () => {
  it("returns existing-open and does NOT call createPullRequest", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([
        { url: "https://github.com/owner/repo/pull/12", number: 12, state: "OPEN" },
      ]),
    });

    const result = await runPrCreate({
      branch: "feat/foo",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    expect(result.status).toBe("existing-open");
    expect((result as { status: "existing-open"; url: string; number: number }).url).toBe("https://github.com/owner/repo/pull/12");
    expect((result as { status: "existing-open"; url: string; number: number }).number).toBe(12);

    // createPullRequest must NOT be called
    expect(githubClient.createPullRequest as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

// TC-002: PR が存在しない場合に新規 PR を作成する
describe("TC-002: runner — PR が存在しない場合に新規 PR を作成する", () => {
  it("calls createPullRequest and returns created", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/owner/repo/pull/42", number: 42 }),
    });

    const result = await runPrCreate({
      branch: "feat/bar",
      baseBranch: "main",
      title: "Add bar",
      body: "PR body content",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    expect(result.status).toBe("created");
    expect((result as { status: "created"; url: string; number: number }).url).toBe("https://github.com/owner/repo/pull/42");
    expect((result as { status: "created"; url: string; number: number }).number).toBe(42);

    // Verify createPullRequest was called with correct args
    expect(githubClient.createPullRequest as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const createArgs = (githubClient.createPullRequest as ReturnType<typeof vi.fn>).mock.calls[0] as string[];
    expect(createArgs[2]).toBe("feat/bar");   // branch
    expect(createArgs[3]).toBe("main");       // baseBranch
    expect(createArgs[4]).toBe("Add bar");    // title
    expect(createArgs[5]).toBe("PR body content"); // body
  });
});

// TC-003: 既存 MERGED PR の場合に error を返す
describe("TC-003: runner — 既存 MERGED PR の場合に error を返す", () => {
  it("returns error with reason=merged and does NOT call createPullRequest", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([
        { url: "https://github.com/owner/repo/pull/5", number: 5, state: "MERGED" },
      ]),
    });

    const result = await runPrCreate({
      branch: "feat/baz",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    expect(result.status).toBe("error");
    expect((result as { status: "error"; reason: string }).reason).toBe("merged");

    // createPullRequest must NOT be called
    expect(githubClient.createPullRequest as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

// TC-004: gh CLI 失敗時に error を返す
describe("TC-004: runner — GitHub API 失敗時に error を返す", () => {
  it("returns error with reason=gh-failure and re-auth hint in message", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockRejectedValue(new Error("authentication required. Please run gh auth login.")),
    });

    const result = await runPrCreate({
      branch: "feat/auth-fail",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    expect(result.status).toBe("error");
    const errResult = result as { status: "error"; reason: string; message: string };
    expect(errResult.reason).toBe("gh-failure");
    // Message should contain re-auth hint
    expect(errResult.message).toMatch(/specrunner login|gh auth login/i);
  });
});

// TC-005: 既存 CLOSED PR の場合に error を返す
describe("TC-005: runner — 既存 CLOSED PR の場合に error を返す", () => {
  it("returns error with reason=closed and does NOT call createPullRequest", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([
        { url: "https://github.com/owner/repo/pull/3", number: 3, state: "CLOSED" },
      ]),
    });

    const result = await runPrCreate({
      branch: "feat/closed",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    expect(result.status).toBe("error");
    expect((result as { status: "error"; reason: string }).reason).toBe("closed");
    expect(githubClient.createPullRequest as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

// TC-006: body がそのまま API に渡される
describe("TC-006: runner — body はそのまま createPullRequest に渡される", () => {
  it("createPullRequest is called with the exact body string", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/owner/repo/pull/99", number: 99 }),
    });

    await runPrCreate({
      branch: "feat/body-test",
      baseBranch: "main",
      title: "Title",
      body: "Body content for test",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    const createArgs = (githubClient.createPullRequest as ReturnType<typeof vi.fn>).mock.calls[0] as string[];
    // body is the 6th argument (index 5)
    expect(createArgs[5]).toBe("Body content for test");
  });
});

// TC-007: PR 不在は listPullRequests 空配列のみで判定される
describe("TC-007: runner — PR 不在は空配列のみで判定される", () => {
  it("PR absence is determined only by empty array from listPullRequests", async () => {
    const { runPrCreate } = await import("../../../../src/core/pr-create/runner.js");

    const githubClient = makeMockGithubClient({
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/owner/repo/pull/10", number: 10 }),
    });

    const result = await runPrCreate({
      branch: "feat/no-pr",
      baseBranch: "main",
      title: "Title",
      body: "Body",
      cwd: "/repo",
      githubClient,
      owner: "owner",
      repo: "repo",
    });

    // Should be "created" because array was empty
    expect(result.status).toBe("created");
  });
});
