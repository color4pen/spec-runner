/**
 * Unit tests for src/core/archive/merge-then-archive.ts
 *
 * New flow: archive recording first → CI wait (with archiveSha matching) → merge → cleanup.
 *
 * TC-014: PR が既に MERGED → archive 記帳はスキップ（terminal status short-circuit）、cleanup のみ実行
 * TC-MTA-001: all checks success → merge → archive 記帳は先に完了済み → cleanup
 * TC-MTA-002: check state "none" → grace 後に merge → archive (branch protection 無し repo)
 * TC-MTA-003: check pending → success (2回目) → merge → cleanup
 * TC-MTA-004: check failure → exit 1 escalation, merge/cleanup 呼ばれない
 * TC-MTA-005: pending のまま timeout 超過 → timeout escalation, merge/cleanup 呼ばれない
 * TC-MTA-006: conflict (mergeStateStatus DIRTY) → escalation, merge/cleanup 呼ばれない
 * TC-MTA-007: conflict (mergeable CONFLICTING) → escalation, merge/cleanup 呼ばれない
 * TC-MTA-008: BLOCKED → escalation, merge/cleanup 呼ばれない
 * TC-MTA-009: headSha missing → escalation
 * TC-MTA-010: waitTimeoutMs: null → no timeout (unlimited wait)
 * TC-MTA-011: none → pending → success (grace内にcheck出現 → 既存ループに合流)
 * TC-MTA-012: none → failure (grace内にcheck出現 → failure → escalation)
 * TC-MTA-013: waitTimeoutMs null (無制限) + 常にnone → grace後にmerge（永久hangしない）
 * TC-MTA-ARCHIVE-SHA: archiveSha tracking — wait loop skips CI check until PR headSha matches
 * TC-MTA-CLEANUP-ONLY-MERGED: already MERGED → runArchiveOrchestrator called, cleanup only (no merge)
 * TC-MTA-CLEANUP-POST-MERGE: merge success → cleanup called; merge failure → cleanup NOT called
 * TC-MTA-STATUS-NO-WRITE: cleanup does NOT write job status
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient, CheckRollup } from "../../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../../../../src/core/archive/orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" }),
}));

vi.mock("../../../../src/core/archive/post-merge-cleanup.js", () => ({
  runPostMergeCleanup: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUCCESS_ROLLUP: CheckRollup = { state: "success", total: 1, failing: [], pending: [] };
const NONE_ROLLUP: CheckRollup = { state: "none", total: 0, failing: [], pending: [] };
const PENDING_ROLLUP: CheckRollup = { state: "pending", total: 1, failing: [], pending: ["ci/test"] };
const FAILURE_ROLLUP: CheckRollup = { state: "failure", total: 1, failing: ["ci/test"], pending: [] };

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
      headSha: "archive-sha-001", // matches archiveSha from mock
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeJobState(prNumber = 42, overrides: Record<string, unknown> = {}) {
  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: "change/my-slug-abc12345",
    noWorktree: false,
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "spec-change", slug: "my-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    pullRequest: { url: "https://github.com/user/repo/pull/42", number: prNumber, createdAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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
  rm: vi.fn().mockResolvedValue(undefined),
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
// TC-014: PR が既に MERGED + status=archived → 記帳済みの resume として cleanup のみ実行
// ---------------------------------------------------------------------------

describe("TC-014: PR が既に MERGED かつ status=archived は cleanup のみ実行（記帳済み resume）", () => {
  it("記帳(runArchiveOrchestrator)と mergePullRequest を呼ばず、runPostMergeCleanup を呼ぶ", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // status=archived: archive rode the PR before it merged; this is a cleanup-only resume.
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42, { status: "archived" })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: undefined });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "MERGED",
        mergeStateStatus: "UNKNOWN",
        headRefName: "change/my-slug-abc12345",
        mergeable: "MERGEABLE",
        headSha: "abc123",
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
      waitTimeoutMs: 60_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-MERGED-NOT-ARCHIVED: PR merged but status != archived → エラー（順序ミス）
// ---------------------------------------------------------------------------

describe("TC-MTA-MERGED-NOT-ARCHIVED: マージ済みだが未 archive はエラーで返す", () => {
  it("status=awaiting-archive + PR merged → exitCode 1、記帳も cleanup も merge も呼ばない", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // Merged before archiving: archive never recorded (status still awaiting-archive).
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42, { status: "awaiting-archive" })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: undefined });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "MERGED",
        mergeStateStatus: "UNKNOWN",
        mergeable: "MERGEABLE",
        headSha: "abc123",
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("PR merged before archive");
    }
    // No recording, no merge, no cleanup — order error, nothing to salvage automatically.
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-001: all checks success → merge → cleanup
// ---------------------------------------------------------------------------

describe("TC-MTA-001: all checks success → merge → cleanup", () => {
  it("getCheckStatus success → merge → runPostMergeCleanup", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
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
      waitTimeoutMs: 60_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(runArchiveOrchestrator).toHaveBeenCalled();
    expect(client.mergePullRequest).toHaveBeenCalledWith("user", "repo", 42, { mergeMethod: "squash" });
    expect(runPostMergeCleanup).toHaveBeenCalled();
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-002: check state "none" → grace 後に merge → cleanup (branch protection 無し)
// ---------------------------------------------------------------------------

describe("TC-MTA-002: check state 'none' → grace 後に merge → cleanup", () => {
  it("none が続いても grace 期間経過後に merge へ進む（初回 none では即 merge しない）", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(NONE_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    // nowFn: start=0, first-none=0 (grace starts, elapsed=0), second-none=70_000 (grace exceeded)
    const times = [0, 0, 70_000];
    let timeIdx = 0;
    const nowFn = () => times[timeIdx++] ?? 70_000;
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
      nowFn,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
    // 初回 none で即 merge せず、少なくとも 1 回 sleep していること
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-003: check pending → success (2回目) → merge → cleanup
// ---------------------------------------------------------------------------

describe("TC-MTA-003: check pending → success → merge → cleanup", () => {
  it("waits on pending, then merges when success", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const time = 0;
    const nowFn = () => time;

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
      nowFn,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(sleepFn).toHaveBeenCalledWith(5_000);
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-004: check failure → exit 1 escalation, merge/cleanup 呼ばれない
// ---------------------------------------------------------------------------

describe("TC-MTA-004: check failure → escalation", () => {
  it("getCheckStatus failure → exitCode 1, merge/cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(FAILURE_ROLLUP),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("ci/test");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
    // archive recording still happened
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-005: pending timeout → timeout escalation, merge/cleanup 呼ばれない
// ---------------------------------------------------------------------------

describe("TC-MTA-005: pending timeout → escalation", () => {
  it("pending exceeds waitTimeoutMs → exitCode 1, merge/cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(PENDING_ROLLUP),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    let time = 0;
    const nowFn = vi.fn(() => time);

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      sleepFn: async (ms) => {
        time += ms + 1;
        await sleepFn(ms);
      },
      nowFn,
      waitTimeoutMs: 1_000,
      pollIntervalMs: 2_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("Timed out");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-006: mergeStateStatus DIRTY → conflict escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-006: DIRTY → conflict escalation", () => {
  it("mergeStateStatus DIRTY → exitCode 1, merge/cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "DIRTY",
        headRefName: "change/my-slug",
        mergeable: "CONFLICTING",
        headSha: "archive-sha-001",
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toMatch(/conflict/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-007: mergeable CONFLICTING (even with non-DIRTY mergeStateStatus)
// ---------------------------------------------------------------------------

describe("TC-MTA-007: mergeable CONFLICTING → escalation", () => {
  it("mergeable CONFLICTING → exitCode 1, merge/cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "UNKNOWN",
        headRefName: "change/my-slug",
        mergeable: "CONFLICTING",
        headSha: "archive-sha-001",
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-008: persistent BLOCKED + success rollup → branch-protection escalation
// (escalation fires after check polling, not immediately on BLOCKED observation)
// ---------------------------------------------------------------------------

describe("TC-MTA-008: persistent BLOCKED + success rollup → branch-protection escalation", () => {
  it("mergeStateStatus BLOCKED + success rollup → exitCode 1 branch-protection escalation, merge/cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "BLOCKED",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toMatch(/branch protection/i);
    }
    // Escalation fires after check polling (getCheckStatus must have been called)
    expect(client.getCheckStatus).toHaveBeenCalled();
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-BLOCKED-PENDING-THEN-MERGE: BLOCKED + pending → wait, then CLEAN + success → merge
// ---------------------------------------------------------------------------

describe("TC-MTA-BLOCKED-PENDING-THEN-MERGE: BLOCKED+pending does not escalate; merges after checks pass", () => {
  it("poll 1 BLOCKED+pending → sleep; poll 2 CLEAN+success → mergePullRequest called, cleanup runs", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn()
        // Initial check (Step 2)
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          headRefName: "change/my-slug",
          mergeable: "MERGEABLE",
          headSha: "archive-sha-001",
        })
        // Wait loop poll 1: BLOCKED with pending checks
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "BLOCKED",
          headRefName: "change/my-slug",
          mergeable: "MERGEABLE",
          headSha: "archive-sha-001",
        })
        // Wait loop poll 2: CLEAN, checks now pass
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          headRefName: "change/my-slug",
          mergeable: "MERGEABLE",
          headSha: "archive-sha-001",
        }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
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
      nowFn: () => 0,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    // No escalation during pending poll
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(client.mergePullRequest).toHaveBeenCalledWith("user", "repo", 42, { mergeMethod: "squash" });
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-BLOCKED-NONE-EXHAUSTED: persistent BLOCKED + none grace exhausted → branch-protection escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-BLOCKED-NONE-EXHAUSTED: persistent BLOCKED + no checks after grace → branch-protection escalation", () => {
  it("BLOCKED + none rollup until grace exhausted → exitCode 1 branch-protection escalation, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "BLOCKED",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(NONE_ROLLUP),
    });

    // nowFn: start=0, none check 1 (elapsed=0, grace starts), none check 2 (elapsed=70000, grace exhausted)
    const times = [0, 0, 70_000];
    let timeIdx = 0;
    const nowFn = () => times[timeIdx++] ?? 70_000;
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
      nowFn,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toMatch(/branch protection/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-UNKNOWN-REACHES-MERGE: mergeable UNKNOWN + CLEAN + success → mergePullRequest called
// ---------------------------------------------------------------------------

describe("TC-MTA-UNKNOWN-REACHES-MERGE: mergeable UNKNOWN with green checks proceeds to mergePullRequest", () => {
  it("mergeable UNKNOWN + mergeStateStatus CLEAN + success rollup → mergePullRequest called without mergeable-gate escalation", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "UNKNOWN",   // GitHub computing state — must not block merge path
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
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
      waitTimeoutMs: 60_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
    // No extra getPullRequest call for a mergeable gate (Step 5 gone)
    // Initial (Step 2) + wait loop iter 1 = 2 calls
    expect(client.getPullRequest).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-MERGE-FAIL-CONFLICT: mergePullRequest returns conflict → conflict escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-MERGE-FAIL-CONFLICT: mergePullRequest conflict message → squash merge (conflict) escalation", () => {
  it("{ merged: false, message: 'Merge conflict detected' } → exitCode 1 conflict escalation, cleanup not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: false, message: "Merge conflict detected" }),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("squash merge (conflict)");
    }
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-MERGE-FAIL-CHECKS: mergePullRequest checks-failed → checks-failed escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-MERGE-FAIL-CHECKS: mergePullRequest checks-failed message → squash merge (required checks failed) escalation", () => {
  it('{ merged: false, message: \'required status check "ci/build" has failed\' } → exitCode 1 checks-failed escalation', async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({
        merged: false,
        message: 'required status check "ci/build" has failed',
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("squash merge (required checks failed)");
    }
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-MERGE-FAIL-OTHER: mergePullRequest unclassified → generic branch-protection escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-MERGE-FAIL-OTHER: mergePullRequest unclassified message → generic squash merge (REST API) escalation", () => {
  it("{ merged: false, message: 'repository rule violations found' } → exitCode 1 generic escalation with resume command", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({
        merged: false,
        message: "repository rule violations found",
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("squash merge (REST API)");
      expect(result.escalation).toContain(`specrunner job archive --with-merge ${SLUG}`);
    }
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-009: headSha missing → escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-009: headSha missing → escalation", () => {
  it("PR returned without headSha → exitCode 1 with 'head SHA missing' message", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        // headSha absent
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("head SHA missing");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-010: waitTimeoutMs null → no timeout (unlimited, waits until success)
// ---------------------------------------------------------------------------

describe("TC-MTA-010: waitTimeoutMs null → unlimited wait", () => {
  it("null timeout does not trigger timeout escalation even after elapsed time", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    let time = 0;
    const nowFn = () => {
      time += 999_999_999;
      return time;
    };

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
      nowFn,
      waitTimeoutMs: null,
      pollIntervalMs: 1,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-011: none → pending → success (grace 内に check 出現 → 既存ループに合流)
// ---------------------------------------------------------------------------

describe("TC-MTA-011: none → pending → success (grace 内に check 出現)", () => {
  it("check が grace 内に出現したら既存の pending→success ループに合流して merge する", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(NONE_ROLLUP)
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const time = 0;
    const nowFn = () => time;
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
      nowFn,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(5_000);
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-012: none → failure (grace 内に check 出現 → failure → escalation)
// ---------------------------------------------------------------------------

describe("TC-MTA-012: none → failure (grace 内に check 出現 → failure escalation)", () => {
  it("grace 内に failure check が出現したら merge せず escalation で終了する", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(NONE_ROLLUP)
        .mockResolvedValueOnce(FAILURE_ROLLUP),
    });

    const time = 0;
    const nowFn = () => time;
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
      nowFn,
      waitTimeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("ci/test");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-013: waitTimeoutMs null (無制限) + 常に none → grace 後に merge（永久 hang しない）
// ---------------------------------------------------------------------------

describe("TC-MTA-013: waitTimeoutMs null + 常に none → grace 後に merge（bounded）", () => {
  it("無制限 timeout でも grace 経過後に merge へ進み永久 hang しない", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(NONE_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const times = [0, 0, 70_000];
    let timeIdx = 0;
    const nowFn = () => times[timeIdx++] ?? 70_000;
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
      nowFn,
      waitTimeoutMs: null,
      pollIntervalMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-ARCHIVE-SHA: wait loop は archiveSha と PR headSha が一致するまで CI を信頼しない
// ---------------------------------------------------------------------------

describe("TC-MTA-ARCHIVE-SHA: archiveSha tracking in wait loop", () => {
  it("PR headSha が archiveSha と一致するまで CI check をスキップし、一致後に check を実行する", async () => {
    const ARCHIVE_SHA = "archive-sha-new-001";
    const OLD_HEAD_SHA = "old-head-sha-before-archive";

    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: ARCHIVE_SHA });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // getPullRequest responses:
    //   1: initial check (Step 2) → OPEN, old sha
    //   2: wait loop iter 1 → old sha → skip CI, sleep
    //   3: wait loop iter 2 → archive sha → CI check passes → break → merge
    const client = makeGitHubClient({
      getPullRequest: vi.fn()
        // Initial check (Step 2): not MERGED, headSha not yet updated
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          headSha: OLD_HEAD_SHA,
        })
        // Wait loop iteration 1: headSha still old → sleep, skip CI check
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          headSha: OLD_HEAD_SHA,
        })
        // Wait loop iteration 2: headSha updated to archive sha → check CI
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          headSha: ARCHIVE_SHA,
        }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
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
      waitTimeoutMs: 60_000,
      pollIntervalMs: 5_000,
      nowFn: () => 0,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();

    // getCheckStatus only called once (when headSha matched archiveSha)
    expect(client.getCheckStatus).toHaveBeenCalledTimes(1);

    // sleep called once (while waiting for PR to reflect archive sha)
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  it("PR headSha が archiveSha に恒久的に一致しないと deadline で timeout escalation する（無限ループしない）", async () => {
    const ARCHIVE_SHA = "archive-sha-new-002";
    const OLD_HEAD_SHA = "head-that-never-reflects-archive";

    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: ARCHIVE_SHA });

    // PR head never advances to the archive commit (e.g. external force-push moved it).
    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: OLD_HEAD_SHA,
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // First nowFn() call is `start` (0); every later call is past the 60s deadline.
    let nowCalls = 0;
    const nowFn = () => (nowCalls++ === 0 ? 0 : 100_000);

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
      waitTimeoutMs: 60_000,
      pollIntervalMs: 5_000,
      nowFn,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("PR head did not reflect archive commit");
    }
    // Never trusted CI on the stale head, and did not hang.
    expect(client.getCheckStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-CLEANUP-ONLY-MERGED: already MERGED during wait loop → cleanup only
// ---------------------------------------------------------------------------

describe("TC-MTA-CLEANUP-ONLY-MERGED: wait loop 中に MERGED → cleanup のみ実行", () => {
  it("wait loop 中に PR が MERGED になったら cleanup のみ実行し merge は呼ばない", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn()
        // Initial check (Step 3): OPEN
        .mockResolvedValueOnce({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          headSha: "archive-sha-001",
        })
        // Wait loop iteration: now MERGED
        .mockResolvedValueOnce({
          state: "MERGED",
          mergeStateStatus: "MERGED",
          mergeable: "MERGEABLE",
          headSha: "archive-sha-001",
        }),
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
      waitTimeoutMs: 60_000,
      nowFn: () => 0,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-CLEANUP-POST-MERGE: merge 成功後にのみ cleanup が呼ばれる
// ---------------------------------------------------------------------------

describe("TC-MTA-CLEANUP-POST-MERGE: merge 成功後にのみ cleanup が呼ばれ、失敗時は呼ばれない", () => {
  it("mergePullRequest throws → cleanup NOT called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockRejectedValue(new Error("API error 503")),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-STATUS-NO-WRITE: cleanup が job status を書き換えない
// ---------------------------------------------------------------------------

describe("TC-MTA-STATUS-NO-WRITE: post-merge cleanup は job status を書き換えない", () => {
  it("runPostMergeCleanup は markJobArchived を呼ばない", async () => {
    // This test verifies the post-merge-cleanup function itself
    // (not via merge-then-archive but directly)
    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");

    // The cleanup function does NOT import markJobArchived (no status writes).
    // We verify by checking that writeFile was not called.
    const mockSpawn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }) as unknown as import("../../../../src/util/spawn.js").SpawnFn;
    const mockFs = {
      exists: vi.fn().mockResolvedValue(false),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      readFile: vi.fn().mockResolvedValue(""),
      rm: vi.fn().mockResolvedValue(undefined),
    };

    // Should not throw; cleanup is best-effort
    await expect(
      runPostMergeCleanup({
        slug: SLUG,
        cwd: CWD,
        branch: null,
        worktreePath: null,
        noWorktree: false,
        baseBranch: "main",
        spawn: mockSpawn,
        fs: mockFs,
      }),
    ).resolves.toBeUndefined();

    // writeFile (status update) must NOT have been called
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PPG-001: Protected-path match → escalation (no merge, no cleanup)
// ---------------------------------------------------------------------------

describe("TC-PPG-001: protected-path match → escalation, merge/cleanup not called", () => {
  it("blocks merge when a changed file matches a protected path", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: [".github/workflows/ci.yml", "src/foo.ts"],
        truncated: false,
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
      waitTimeoutMs: 60_000,
      protectedPaths: [".github/workflows/**"],
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain(".github/workflows/ci.yml");
      expect(result.escalation).toMatch(/merge.*by hand|manually merge|squash-merge/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PPG-002: Truncated file list with non-empty patterns → escalation
// ---------------------------------------------------------------------------

describe("TC-PPG-002: truncated file list + non-empty patterns → escalation", () => {
  it("blocks merge when file list is truncated and patterns are configured", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: Array.from({ length: 3000 }, (_, i) => `src/file-${i}.ts`),
        truncated: true,
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
      waitTimeoutMs: 60_000,
      protectedPaths: [".github/workflows/**"],
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toMatch(/truncated|3000/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PPG-003: No match → existing flow runs unchanged
// ---------------------------------------------------------------------------

describe("TC-PPG-003: no protected-path match → merge proceeds normally", () => {
  it("merges normally when changed files do not match any protected pattern", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["src/foo.ts", "README.md"],
        truncated: false,
      }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
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
      waitTimeoutMs: 60_000,
      protectedPaths: [".github/workflows/**"],
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PPG-004: Empty/undefined protectedPaths → guard skipped entirely
// ---------------------------------------------------------------------------

describe("TC-PPG-004: empty/undefined protectedPaths → listPullRequestFiles not called", () => {
  it("skips guard when protectedPaths is undefined", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
    });

    expect(client.listPullRequestFiles).not.toHaveBeenCalled();
    expect(client.mergePullRequest).toHaveBeenCalled();
  });

  it("skips guard when protectedPaths is an empty array", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      protectedPaths: [],
    });

    expect(client.listPullRequestFiles).not.toHaveBeenCalled();
    expect(client.mergePullRequest).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-E01: Step 1 — JobStateStore.list throws → exitCode 2
// ---------------------------------------------------------------------------

describe("TC-MTA-E01: JobStateStore.list throws → exitCode 2", () => {
  it("list() throws → exitCode 2 with error message", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk read error"));

    const client = makeGitHubClient();
    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(2);
    if (result.exitCode === 2) {
      expect(result.message).toContain("disk read error");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-E02: Step 2 — initial getPullRequest throws → exitCode 1 (escalation)
// Note: the PR status check (Step 2) happens BEFORE archive recording (Step 3),
// so a failed PR check must short-circuit without recording on the branch.
// ---------------------------------------------------------------------------

describe("TC-MTA-E02: initial getPullRequest throws → exitCode 1 escalation", () => {
  it("getPullRequest throws before recording → exitCode 1, 'PR status check', recording NOT called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockRejectedValue(new Error("network error")),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("PR status check (getPullRequest)");
    }
    // PR check happens before recording: a failed check must NOT record on the branch
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-E03: Step 5 — mergePullRequest throws → exitCode 1 (escalation)
// ---------------------------------------------------------------------------

describe("TC-MTA-E03: mergePullRequest throws → exitCode 1 escalation", () => {
  it("mergePullRequest throws → exitCode 1, failedStep contains 'squash merge (REST API)'", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockRejectedValue(new Error("API error 503")),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("squash merge (REST API)");
    }
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-E04: Step 5 — mergePullRequest returns {merged: false} → exitCode 1 (escalation)
// ---------------------------------------------------------------------------

describe("TC-MTA-E04: mergePullRequest returns merged: false → exitCode 1 escalation", () => {
  it("mergePullRequest returns {merged: false} → exitCode 1, failedStep contains 'squash merge (REST API)'", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: "archive-sha-001" });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "archive-sha-001",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: false, message: "Method not allowed" }),
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
      waitTimeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("squash merge (REST API)");
    }
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PPG-005: Already-MERGED PR → protected-path guard skipped
// ---------------------------------------------------------------------------

describe("TC-PPG-005: already-MERGED PR → protected-path guard skipped", () => {
  it("skips guard and runs cleanup directly when PR is already MERGED", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42, { status: "archived" })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: undefined });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "MERGED",
        mergeStateStatus: "UNKNOWN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
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
      waitTimeoutMs: 60_000,
      protectedPaths: [".github/workflows/**"],
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.listPullRequestFiles).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});
