/**
 * Integration tests for src/core/archive/merge-then-archive.ts
 *
 * TC-008: PR が CLEAN で merge 成功 → archive 実行
 * TC-009: PR が BLOCKED で merge 停止 → exit 1 escalation
 * TC-014: PR が既に MERGED の場合は merge をスキップして archive を実行
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../../../../src/core/archive/orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

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
      headRefName: "change/my-slug-abc12345",
      mergeable: "MERGEABLE",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    ...overrides,
  };
}

function makeJobState(prNumber = 42) {
  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: null,
    branch: "change/my-slug-abc12345",
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "spec-change", slug: "my-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    pullRequest: { url: "https://github.com/user/repo/pull/42", number: prNumber, createdAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const CWD = "/tmp/repo";
const SLUG = "my-slug";
const spawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
const fsMock = {
  exists: vi.fn().mockResolvedValue(true),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(""),
};

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-014: PR が既に MERGED → merge スキップして archive を実行
// ---------------------------------------------------------------------------

describe("TC-014: PR が既に MERGED の場合は merge をスキップして archive を実行", () => {
  it("mergePullRequest を呼ばず、runArchiveOrchestrator を呼ぶ", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "MERGED",
        mergeStateStatus: "UNKNOWN",
        headRefName: "change/my-slug-abc12345",
        mergeable: "MERGEABLE",
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-008: PR が CLEAN で merge 成功 → archive 実行
// ---------------------------------------------------------------------------

describe("TC-008: PR が CLEAN で merge 成功 → archive 実行", () => {
  it("mergePullRequest を呼び、merge 成功後に runArchiveOrchestrator を呼ぶ", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn()
        // Step 2: check PR state
        .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "change/my-slug", mergeable: "MERGEABLE" })
        // Step 4: pollMergeStateAfterPush
        .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "change/my-slug", mergeable: "MERGEABLE" })
        // Step 5: checkMergeableForMerge
        .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "change/my-slug", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      sleepFn,
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalledWith("user", "repo", 42, { mergeMethod: "squash" });
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009: PR が BLOCKED で merge 停止 → exit 1 escalation
// ---------------------------------------------------------------------------

describe("TC-009: PR が BLOCKED で merge 停止 → exit 1 escalation", () => {
  it("BLOCKED mergeStateStatus → exitCode 1 で escalation を返す、archive は呼ばれない", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "BLOCKED",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
      }),
      mergePullRequest: vi.fn(),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      sleepFn,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("BLOCKED");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});
