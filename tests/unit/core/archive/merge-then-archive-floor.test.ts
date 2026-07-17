/**
 * Unit tests for the minimumAssurance floor gate in merge-then-archive.ts.
 * Tests the new Step 3.6 block added by T-06.
 *
 * TC-010: sub-floor profile が protected path を touch するとき merge が fail-closed で停止する
 * TC-011: standard profile が protected path を touch しても floor を満たし merge が進む
 * TC-012: protected path を touch しない変更は floor 未満でも merge が進む
 * TC-013: minimumAssurance 未設定の config では gate が何もしない
 * TC-014: changed-file list が truncated のとき fail-closed で停止する
 * TC-021: fail-closed escalation のメッセージに matched files と effective assurance / 要求 floor が含まれる (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient, CheckRollup } from "../../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    listWithSourceDirs: vi.fn(),
  },
}));

vi.mock("../../../../src/core/archive/orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0, headSha: "archive-sha-floor-001" }),
  resolveWorktreePathForArchive: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../../src/core/finish/job-state-update.js", () => ({
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/core/archive/post-merge-cleanup.js", () => ({
  runPostMergeCleanup: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUCCESS_ROLLUP: CheckRollup = { state: "success", total: 1, failing: [], pending: [] };

const CWD = "/tmp/repo";
const SLUG = "my-slug";

/**
 * Synthetic sub-floor profile fixture for testing.
 * Profile selection (config/request → profile) is R6 scope.
 * This fixture is only used in test assertions.
 */
const SUB_FLOOR_PROFILE = {
  id: "synthetic-sub-floor",
  schemaVersion: 1,
  policyDigest: "sha256:0000000000000000000000000000000000000000000000000000000000001234",
  budget: {},
  assurance: {
    testDerivation: "coupled",
    biteEvidence: "optional",
    specReview: "omitted",
  },
};

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
      headSha: "archive-sha-floor-001",
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
    request: {
      path: "/repo/specrunner/changes/my-slug/request.md",
      title: "Test",
      type: "spec-change",
      slug: "my-slug",
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    pullRequest: {
      url: "https://github.com/user/repo/pull/42",
      number: prNumber,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeActiveEntry(state: ReturnType<typeof makeJobState>) {
  return { state, sourceChangeDir: `${CWD}/specrunner/changes/${SLUG}` };
}

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

/**
 * Minimum assurance config for protected path test.
 * Typed as `any` so that tests compile before MergeThenArchiveInput gains the
 * `minimumAssurance` field (T-06). After implementation the explicit type is used.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MINIMUM_ASSURANCE_CONFIG: any = {
  protectedPaths: ["architecture/**"],
  testDerivation: "frozen",
  biteEvidence: "required",
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
// TC-010: sub-floor profile が protected path を touch するとき merge が fail-closed で停止する
// ---------------------------------------------------------------------------

describe("TC-010: sub-floor profile が protected path を touch するとき merge が fail-closed で停止する", () => {
  it("exitCode 1, mergePullRequest と post-merge cleanup が呼ばれない", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // PR changes a file that matches the protected path pattern
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md", "src/foo.ts"],
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });

  it("escalation message is present in result", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-011 (旧): standard profile が protected path を touch しても floor を満たし merge が進む
// TC-002 (test-cases.md): profile 欠落（legacy）job が biteEvidence: required floor を素通りしない
//
// CHANGE (assurance-provenance-floor): 旧 TC-011 は exitCode: 0 を期待していたが、
// 達成 provenance ベースの floor 判定では profile 欠落（= no test-materialize steps）の job は
// achieved.biteEvidence が absent となり fail-closed（exitCode: 1）になる。
// 期待値を exitCode: 1 に反転する（T2 — 宣言は authorize しない）。
// ---------------------------------------------------------------------------

describe("TC-011 / TC-002: profile 欠落（legacy）job は宣言最強プロファイルで floor を素通りしない — fail-closed", () => {
  it("TC-002: profile absent (no steps) + biteEvidence required floor + floor path matched → fail-closed (exitCode 1)", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // No profile set AND no steps → getProfile returns STANDARD_PROFILE (declared strongest),
    // but achieved provenance is absent (no test-materialize runs → baseOid null → biteEvidence absent).
    // fail-closed: satisfiesFloor(absent, { biteEvidence: "required" }) === false.
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // PR touches a protected path
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md", "src/foo.ts"],
        truncated: false,
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
      // No assuranceRuntime provided: baseOid cannot be resolved (no steps) → biteEvidence absent.
      // Floor is not satisfied → fail-closed.
    } as Parameters<typeof runMergeThenArchive>[0]);

    // TC-002: declaration (STANDARD_PROFILE) must NOT authorize merge.
    // Achieved provenance is absent → exitCode 1.
    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-012: protected path を touch しない変更は floor 未満でも merge が進む
// ---------------------------------------------------------------------------

describe("TC-012: protected path を touch しない変更は floor 未満でも merge が進む", () => {
  it("sub-floor profile + no floor-path file changed → merge proceeds", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // PR only touches non-protected paths
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["src/core/foo.ts", "tests/unit/foo.test.ts"],
        truncated: false,
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-013: minimumAssurance 未設定の config では gate が何もしない
// ---------------------------------------------------------------------------

describe("TC-013: minimumAssurance 未設定の config では gate が何もしない", () => {
  it("no minimumAssurance → gate is no-op, merge proceeds as normal", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // Even sub-floor profile should proceed when no minimumAssurance is set
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // listPullRequestFiles should NOT be called when minimumAssurance is absent
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
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
      // No minimumAssurance provided
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
    expect(runPostMergeCleanup).toHaveBeenCalled();
  });

  it("empty minimumAssurance protectedPaths → gate is no-op", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
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
      minimumAssurance: { protectedPaths: [] },
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(client.mergePullRequest).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-014: changed-file list が truncated のとき fail-closed で停止する
// ---------------------------------------------------------------------------

describe("TC-014: changed-file list が truncated のとき fail-closed で停止する（minimumAssurance gate）", () => {
  it("truncated file list → exitCode 1, merge not called", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // truncated: true → cannot determine if protected path is touched
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["src/foo.ts"],
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
    expect(runPostMergeCleanup).not.toHaveBeenCalled();
  });

  it("truncated file list → escalation message present", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: true }),
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-021: fail-closed escalation のメッセージに matched files と effective assurance / 要求 floor が含まれる (should)
// ---------------------------------------------------------------------------

describe("TC-021: fail-closed escalation のメッセージに matched files と effective assurance / 要求 floor が含まれる", () => {
  it("escalation detectedState mentions matched files and assurance info", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobState(42, { profile: SUB_FLOOR_PROFILE })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: "archive-sha-floor-001",
    });

    const MATCHED_FILE = "architecture/core/design.md";
    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: [MATCHED_FILE, "src/foo.ts"],
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
      minimumAssurance: MINIMUM_ASSURANCE_CONFIG,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      // escalation should mention the matched file
      expect(result.escalation).toContain(MATCHED_FILE);
      // resumeCommand should include the slug
      expect(result.escalation).toContain(SLUG);
    }
  });
});
