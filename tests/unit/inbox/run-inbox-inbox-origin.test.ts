/**
 * TC-018: inbox startJob が inboxOrigin: true を runRunCore に渡す
 *   Source: tasks.md > T-05
 *
 * GIVEN inbox 経路の既定 startJob が呼ばれる（issue 連携あり）
 * WHEN runRunCore の呼び出し引数を spy / mock で取得する
 * THEN inboxOrigin: true が options に含まれている
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubClient } from "../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

// Mock JobStateStore.list to return empty (no slug occupation → default startJob proceeds)
vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
  },
  buildInitialJobState: vi.fn(),
}));

// Mock writeDraft — we don't need real file I/O
vi.mock("../../../src/core/inbox/draft-writer.js", () => ({
  writeDraft: vi.fn().mockResolvedValue(undefined),
}));

// Mock runRunCore to capture its arguments
const mockRunRunCore = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../src/cli/run.js", () => ({
  runRunCore: mockRunRunCore,
  runRun: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runInboxOrchestrator } from "../../../src/core/inbox/run-inbox.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REQUEST_MD = `# Fix login bug

## Meta

- **type**: bug-fix
- **slug**: fix-login-bug
- **base-branch**: main
- **adr**: false
`;

function makeGitHubClient(): GitHubClient {
  return {
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([
      { number: 99, title: "Fix login", body: VALID_REQUEST_MD },
    ]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://..." }),
    verifyBranch: vi.fn(),
    getRawFile: vi.fn(),
    verifyPath: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn(),
    createPullRequest: vi.fn(),
    getPullRequest: vi.fn(),
    getCheckStatus: vi.fn(),
    mergePullRequest: vi.fn(),
    listPullRequestFiles: vi.fn(),
  } as GitHubClient;
}

// ---------------------------------------------------------------------------
// TC-018: inbox の startJob が inboxOrigin: true を runRunCore に渡す
// ---------------------------------------------------------------------------

describe("TC-018: inbox startJob が inboxOrigin: true を runRunCore に渡す", () => {
  beforeEach(() => {
    mockRunRunCore.mockClear();
  });

  it("TC-018: runInboxOrchestrator がデフォルト startJob を使うとき、runRunCore が inboxOrigin: true 付きで呼ばれる", async () => {
    const client = makeGitHubClient();

    await runInboxOrchestrator({
      githubClient: client,
      owner: "testowner",
      repo: "testrepo",
      repoRoot: "/repo",
      approveLabel: "specrunner-approved",
      maxStartsPerRun: 3,
      // effects を注入しない → デフォルト startJob が使われる
    });

    // runRunCore が呼ばれた
    expect(mockRunRunCore).toHaveBeenCalled();

    // 2 番目の引数（options）に inboxOrigin: true が含まれる
    const [, options] = mockRunRunCore.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).toHaveProperty("inboxOrigin", true);
  });
});
