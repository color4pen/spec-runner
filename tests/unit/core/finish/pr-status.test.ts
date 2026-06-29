import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchPrViewWithRetry,
} from "../../../../src/core/finish/pr-status.js";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const owner = "user";
const repo = "repo";
const prNumber = 42;
const slug = "my-slug";
const baseBranch = "main";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchPrViewWithRetry
// ---------------------------------------------------------------------------

describe("fetchPrViewWithRetry", () => {
  it("CLEAN 系成功: getPullRequest が CLEAN を返す → ok: true、sleepFn 未呼び出し", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const githubClient = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN" }),
    });

    const result = await fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ state: "OPEN", mergeStateStatus: "CLEAN" });
    }
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("getPullRequest throw: Error を throw → ok: false、escalation が 'getPullRequest' を含む", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const githubClient = makeGitHubClient({
      getPullRequest: vi.fn().mockRejectedValue(new Error("network error")),
    });

    const result = await fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("getPullRequest");
    }
  });

  it("UNKNOWN→CLEAN retry: 1 回目 UNKNOWN、2 回目 CLEAN → ok: true、sleepFn 1 回、getPullRequest 2 回", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const getPullRequest = vi.fn()
      .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "UNKNOWN" })
      .mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN" });
    const githubClient = makeGitHubClient({ getPullRequest });

    const result = await fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn });

    expect(result.ok).toBe(true);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(getPullRequest).toHaveBeenCalledTimes(2);
  });

  it("UNKNOWN 全消尽: 常に UNKNOWN → ok: false、escalation が 'UNKNOWN' を含む、getPullRequest が 3 回呼ばれる", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const getPullRequest = vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "UNKNOWN" });
    const githubClient = makeGitHubClient({ getPullRequest });

    const result = await fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("UNKNOWN");
    }
    expect(getPullRequest).toHaveBeenCalledTimes(3);
  });

  it("MERGED+UNKNOWN bypass: state=MERGED mergeStateStatus=UNKNOWN → ok: true、sleepFn 未呼び出し、getPullRequest 1 回", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const getPullRequest = vi.fn().mockResolvedValue({ state: "MERGED", mergeStateStatus: "UNKNOWN" });
    const githubClient = makeGitHubClient({ getPullRequest });

    const result = await fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn });

    expect(result.ok).toBe(true);
    expect(sleepFn).not.toHaveBeenCalled();
    expect(getPullRequest).toHaveBeenCalledTimes(1);
  });
});

