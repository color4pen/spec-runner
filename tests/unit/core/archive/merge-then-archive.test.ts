/**
 * Unit tests for src/core/archive/merge-then-archive.ts
 *
 * TC-014: PR が既に MERGED → merge スキップして archive を実行
 * TC-MTA-001: all checks success → merge → archive
 * TC-MTA-002: check state "none" → merge → archive (branch protection 無し repo)
 * TC-MTA-003: check pending → success (2回目) → merge → archive
 * TC-MTA-004: check failure → exit 1 escalation, merge/archive 呼ばれない
 * TC-MTA-005: pending のまま timeout 超過 → timeout escalation, merge/archive 呼ばれない
 * TC-MTA-006: conflict (mergeStateStatus DIRTY) → escalation, merge 呼ばれない
 * TC-MTA-007: conflict (mergeable CONFLICTING) → escalation, merge 呼ばれない
 * TC-MTA-008: BLOCKED → escalation, merge 呼ばれない
 * TC-MTA-009: headSha missing → escalation
 * TC-MTA-010: waitTimeoutMs: null → no timeout (unlimited wait)
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
  runArchiveOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0 }),
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
      headSha: "abc123",
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
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

    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-001: all checks success → merge → archive
// ---------------------------------------------------------------------------

describe("TC-MTA-001: all checks success → merge → archive", () => {
  it("getCheckStatus success → merge → archive", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
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

    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalledWith("user", "repo", 42, { mergeMethod: "squash" });
    expect(runArchiveOrchestrator).toHaveBeenCalled();
    expect(sleepFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-002: check state "none" → merge → archive (branch protection 無し)
// ---------------------------------------------------------------------------

describe("TC-MTA-002: check state 'none' → merge → archive", () => {
  it("getCheckStatus none (no checks) → proceeds to merge", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      getCheckStatus: vi.fn().mockResolvedValue(NONE_ROLLUP),
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

    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-003: check pending → success (2回目) → merge → archive
// ---------------------------------------------------------------------------

describe("TC-MTA-003: check pending → success → merge → archive", () => {
  it("waits on pending, then merges when success", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    let time = 0;
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

    expect(result).toEqual({ exitCode: 0 });
    expect(sleepFn).toHaveBeenCalledWith(5_000);
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-004: check failure → exit 1 escalation, merge/archive 呼ばれない
// ---------------------------------------------------------------------------

describe("TC-MTA-004: check failure → escalation", () => {
  it("getCheckStatus failure → exitCode 1, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
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
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-005: pending timeout → timeout escalation, merge/archive 呼ばれない
// ---------------------------------------------------------------------------

describe("TC-MTA-005: pending timeout → escalation", () => {
  it("pending exceeds waitTimeoutMs → exitCode 1, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      // Always pending
      getCheckStatus: vi.fn().mockResolvedValue(PENDING_ROLLUP),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // Advance time past timeout on first sleep call
    let time = 0;
    const nowFn = vi.fn(() => time);

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    // Use a tiny timeout so it fires immediately after first pending result
    const result = await runMergeThenArchive({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      sleepFn: async (ms) => {
        time += ms + 1; // advance time past interval + 1ms
        await sleepFn(ms);
      },
      nowFn,
      waitTimeoutMs: 1_000, // 1 second timeout
      pollIntervalMs: 2_000, // 2 second interval (longer than timeout → fires after 1st sleep)
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("Timed out");
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-006: mergeStateStatus DIRTY → conflict escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-006: DIRTY → conflict escalation", () => {
  it("mergeStateStatus DIRTY → exitCode 1, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "DIRTY",
        headRefName: "change/my-slug",
        mergeable: "CONFLICTING",
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
      expect(result.escalation).toMatch(/conflict/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-007: mergeable CONFLICTING (even with non-DIRTY mergeStateStatus)
// ---------------------------------------------------------------------------

describe("TC-MTA-007: mergeable CONFLICTING → escalation", () => {
  it("mergeable CONFLICTING → exitCode 1, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState(42)]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "UNKNOWN",
        headRefName: "change/my-slug",
        mergeable: "CONFLICTING",
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
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-MTA-008: BLOCKED → branch protection escalation
// ---------------------------------------------------------------------------

describe("TC-MTA-008: BLOCKED → branch protection escalation", () => {
  it("mergeStateStatus BLOCKED → exitCode 1, merge not called", async () => {
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
      expect(result.escalation).toMatch(/branch protection/i);
    }
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
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
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

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
    expect(runArchiveOrchestrator).not.toHaveBeenCalled();
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
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const client = makeGitHubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "change/my-slug",
        mergeable: "MERGEABLE",
        headSha: "abc123",
      }),
      getCheckStatus: vi.fn()
        .mockResolvedValueOnce(PENDING_ROLLUP)
        .mockResolvedValueOnce(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // Advance time far beyond any finite timeout
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
      waitTimeoutMs: null, // unlimited
      pollIntervalMs: 1,
    });

    // Should eventually succeed (after pending → success)
    expect(result).toEqual({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runArchiveOrchestrator).toHaveBeenCalled();
  });
});
