/**
 * Unit tests for the achieved-provenance floor gate in merge-then-archive.ts.
 *
 * This file covers the NEW provenance-based Step 3.6 behavior introduced by
 * the assurance-provenance-floor change. The gate now evaluates "achieved"
 * assurance (derived from mechanical evidence) instead of declared profile
 * assurance.
 *
 * TC-001: custom verification.commands 環境で biteEvidence required floor が fail-closed になる（anti-regression）
 * TC-003: 全 base-red かつ凍結 intact の job が floor を満たし merge が進む
 * TC-004: materialize 済み test が baseOid→HEAD 間で改変されている場合に fail-closed になる（凍結の歯）
 * TC-005: baseOid で green の test（空洞）が base-red 要件を満たさず fail-closed になる
 * TC-006: 最終 HEAD OID undefined で constrained floor に対し fail-closed になる
 * TC-007: baseOid 欠落で constrained floor に対し fail-closed になる
 * TC-008: listCommitChangedFiles unavailable で constrained floor に対し fail-closed になる
 * TC-009: 二 OID diff unavailable で constrained floor に対し fail-closed になる
 * TC-010: runTestsAtCommit unavailable で constrained floor に対し fail-closed になる
 * TC-011: materialized test 0 件で constrained floor に対し fail-closed になる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient, CheckRollup } from "../../../../src/core/port/github-client.js";
import type { StepRun } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    listWithSourceDirs: vi.fn(),
  },
}));

vi.mock("../../../../src/core/archive/orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0, headSha: "archive-head-sha-prov-001" }),
  resolveWorktreePathForArchive: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../../src/core/finish/job-state-update.js", () => ({
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/core/archive/post-merge-cleanup.js", () => ({
  runPostMergeCleanup: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUCCESS_ROLLUP: CheckRollup = { state: "success", total: 1, failing: [], pending: [] };

const CWD = "/tmp/repo";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-prov-001";
const CANDIDATE_OID = "candidate-commit-sha-prov-001";
const ARCHIVE_HEAD_SHA = "archive-head-sha-prov-001";

/**
 * minimumAssurance config requiring both testDerivation:frozen and biteEvidence:required.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLOOR_BITE_EVIDENCE_REQUIRED: any = {
  protectedPaths: ["architecture/**"],
  biteEvidence: "required",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _FLOOR_BOTH_REQUIRED: any = {
  protectedPaths: ["architecture/**"],
  testDerivation: "frozen",
  biteEvidence: "required",
};

// ---------------------------------------------------------------------------
// Fake runtime type
// ---------------------------------------------------------------------------

type ChangedFilesResult =
  | { kind: "success"; files: string[] }
  | { kind: "unavailable"; reason: string };

type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

interface FakeAssuranceRuntime {
  listCommitChangedFiles(oid: string, cwd: string): Promise<ChangedFilesResult>;
  runTestsAtCommit(oid: string, testFiles: string[], cwd: string, config: unknown): Promise<IsolatedTestResult>;
  diffPathsBetweenCommits(baseOid: string, headOid: string, paths: string[], cwd: string): Promise<ChangedFilesResult>;
}

/**
 * Build a fake assuranceRuntime with configurable responses.
 *
 * Defaults model a "fully achieved" job:
 *   - listCommitChangedFiles: returns one test file
 *   - diffPathsBetweenCommits: returns empty (frozen intact)
 *   - runTestsAtCommit(baseOid): returns all red (base-red satisfied)
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: { file: string; passed: boolean }[] | "unavailable";
} = {}): FakeAssuranceRuntime {
  const {
    changedFiles = ["tests/unit/foo.test.ts"],
    diffFiles = [],
    baseTestResults = [{ file: "tests/unit/foo.test.ts", passed: false }],
  } = options;

  return {
    async listCommitChangedFiles(_oid: string, _cwd: string): Promise<ChangedFilesResult> {
      if (changedFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake listCommitChangedFiles unavailable" };
      }
      return { kind: "success", files: changedFiles };
    },
    async diffPathsBetweenCommits(
      _baseOid: string,
      _headOid: string,
      _paths: string[],
      _cwd: string,
    ): Promise<ChangedFilesResult> {
      if (diffFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake diffPathsBetweenCommits unavailable" };
      }
      return { kind: "success", files: diffFiles };
    },
    async runTestsAtCommit(
      _oid: string,
      _testFiles: string[],
      _cwd: string,
      _config: unknown,
    ): Promise<IsolatedTestResult> {
      if (baseTestResults === "unavailable") {
        return { kind: "unavailable", reason: "Cannot scope custom verification.commands to individual test files" };
      }
      return { kind: "ran", results: baseTestResults };
    },
  };
}

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
      headSha: ARCHIVE_HEAD_SHA,
    }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
    listPullRequestFiles: vi.fn().mockResolvedValue({
      files: ["architecture/core/design.md", "src/foo.ts"],
      truncated: false,
    }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeStepRunWithOid(commitOid: string, attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:01:00.000Z",
    endedAt: "2026-01-01T00:02:00.000Z",
    commitOid,
  } as StepRun & { commitOid: string };
}

/**
 * Build a job state that has test-materialize and implementer steps with OIDs
 * (required for baseOid / candidateOid resolution in deriveAchievedAssurance).
 */
function makeJobStateWithSteps(prNumber = 42, overrides: Record<string, unknown> = {}) {
  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: "change/my-slug-abc12345",
    noWorktree: false,
    request: {
      path: "/repo/specrunner/changes/my-slug/request.md",
      title: "Test",
      type: "new-feature",
      slug: "my-slug",
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    steps: {
      "test-materialize": [makeStepRunWithOid(BASE_OID)],
      "implementer": [makeStepRunWithOid(CANDIDATE_OID)],
    },
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

function makeActiveEntry(state: ReturnType<typeof makeJobStateWithSteps>) {
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

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-001: custom verification.commands 環境で biteEvidence required floor が fail-closed になる
// （anti-regression — 今回の見逃しを二度と通さない）
// ---------------------------------------------------------------------------

describe("TC-001: custom verification.commands 環境で biteEvidence required floor が fail-closed になる（anti-regression）", () => {
  it(
    "TC-001: runTestsAtCommit unavailable (custom commands) → biteEvidence achieved absent → exitCode 1, mergePullRequest not called",
    async () => {
      // Destructive invariant: if derived achieved is always "required" (bypassing the check),
      // this test would pass with exitCode 0 (merge proceeds). The test MUST fail in that case.
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps(42)),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
      (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const client = makeGitHubClient({
        // PR touches a protected path
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md", "src/foo.ts"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // assuranceRuntime simulates: custom verification.commands → runTestsAtCommit unavailable
      // listCommitChangedFiles returns test files (materialize found)
      // diffPathsBetweenCommits returns empty (frozen intact)
      // runTestsAtCommit returns unavailable (custom commands in this repo)
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [],
        baseTestResults: "unavailable", // custom verification.commands → unavailable
      });

      const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
        slug: SLUG,
        cwd: CWD,
        spawn: spawnFn,
        fs: fsMock,
        githubClient: client,
        owner: "user",
        repo: "repo",
        waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
        assuranceRuntime,
        config: { version: 1, agents: {}, verification: { commands: ["bun run test"] } },
      });

      // TC-001: anti-regression — runTestsAtCommit unavailable must not authorize merge.
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
      expect(runPostMergeCleanup).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-003: 全 base-red かつ凍結 intact の job が floor を満たし merge が進む
// ---------------------------------------------------------------------------

describe("TC-003: 全 base-red かつ凍結 intact の job が floor を満たし merge が進む", () => {
  it(
    "TC-003: all base-red + frozen (empty diff) → achieved biteEvidence required → exitCode 0, mergePullRequest called",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps(42)),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
      (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
        getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // Full achieved scenario:
      // - changedFiles: one test file materialized
      // - diffFiles: empty (frozen intact — no changes baseOid→HEAD)
      // - baseTestResults: all red (base-red satisfied → hollow test detector passes)
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [],
        baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
      });

      const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
        slug: SLUG,
        cwd: CWD,
        spawn: spawnFn,
        fs: fsMock,
        githubClient: client,
        owner: "user",
        repo: "repo",
        waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
        assuranceRuntime,
        config: { version: 1, agents: {} },
      });

      // TC-003: gate is not always fail — achieved provenance must authorize merge.
      expect(result.exitCode).toBe(0);
      expect(client.mergePullRequest).toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: materialize 済み test が baseOid→HEAD 間で改変されている場合に fail-closed になる（凍結の歯）
// Destructive invariant: removing the freeze check would cause this test to pass (exitCode 0).
// ---------------------------------------------------------------------------

describe("TC-004: materialize 済み test が baseOid→HEAD 間で改変されている場合に fail-closed になる（凍結の歯）", () => {
  it(
    "TC-004: diffPathsBetweenCommits returns non-empty → tamper detected → fail-closed even when base-red",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps(42)),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
      (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // Freeze broken: diffPathsBetweenCommits returns modified test file
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: ["tests/unit/foo.test.ts"], // tamper: test file changed baseOid→HEAD
        baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }], // base-red satisfied
      });

      const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
        slug: SLUG,
        cwd: CWD,
        spawn: spawnFn,
        fs: fsMock,
        githubClient: client,
        owner: "user",
        repo: "repo",
        waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
        assuranceRuntime,
        config: { version: 1, agents: {} },
      });

      // TC-004: freeze tooth — tamper must block merge even when base-red
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: baseOid で green の test（空洞）が base-red 要件を満たさず fail-closed になる
// ---------------------------------------------------------------------------

describe("TC-005: baseOid で green の test（空洞）が base-red 要件を満たさず fail-closed になる", () => {
  it(
    "TC-005: runTestsAtCommit returns passed=true (hollow) → achieved biteEvidence absent → fail-closed",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps(42)),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
      (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // Hollow test: base test passes at baseOid → not a real tooth
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [], // frozen intact
        baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: true }], // hollow (base-green)
      });

      const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
        slug: SLUG,
        cwd: CWD,
        spawn: spawnFn,
        fs: fsMock,
        githubClient: client,
        owner: "user",
        repo: "repo",
        waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
        assuranceRuntime,
        config: { version: 1, agents: {} },
      });

      // TC-005: hollow test must not satisfy biteEvidence floor
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005b: base test results が空 / 部分的でも base-red を vacuous に満たさない
//   (fail-open hardening): runTestsAtCommit が ran でも、materialized test 全件に
//   passed=false が対応しない限り biteEvidence を達成扱いしない。
// ---------------------------------------------------------------------------

describe("TC-005b: base test results が空 / 部分的なら base-red を満たさず fail-closed になる", () => {
  it("TC-005b: empty results (ran but zero) → base-red not established → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: ARCHIVE_HEAD_SHA });
    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: ["architecture/core/design.md"], truncated: false }),
    });
    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");
    // ran but zero results — must NOT vacuously satisfy base-red
    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts"],
      diffFiles: [],
      baseTestResults: [],
    });
    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED, assuranceRuntime,
      config: { version: 1, agents: {} },
    });
    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-005b: partial results (a materialized file has no red result) → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0, headSha: ARCHIVE_HEAD_SHA });
    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: ["architecture/core/design.md"], truncated: false }),
    });
    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");
    // Two materialized files but only one has a red result; the other is unaccounted → fail-closed
    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"],
      diffFiles: [],
      baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
    });
    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED, assuranceRuntime,
      config: { version: 1, agents: {} },
    });
    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-006: 最終 HEAD OID undefined で constrained floor に対し fail-closed になる
// TC-007: baseOid 欠落で constrained floor に対し fail-closed になる
// TC-008: listCommitChangedFiles unavailable で constrained floor に対し fail-closed になる
// TC-009: 二 OID diff unavailable で constrained floor に対し fail-closed になる
// TC-010: runTestsAtCommit unavailable で constrained floor に対し fail-closed になる
// TC-011: materialized test 0 件で constrained floor に対し fail-closed になる
// ---------------------------------------------------------------------------

describe("TC-006: 最終 HEAD OID undefined で constrained floor に対し fail-closed になる", () => {
  it("TC-006: archiveSha undefined → finalHeadOid undefined → biteEvidence achieved absent → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    // headSha undefined → archiveSha undefined → finalHeadOid undefined
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: undefined,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts"],
      diffFiles: [],
      baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe("TC-007: baseOid 欠落で constrained floor に対し fail-closed になる", () => {
  it("TC-007: no test-materialize step → baseOid null → biteEvidence achieved absent → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // State without test-materialize step → baseOid null
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(
        makeJobStateWithSteps(42, {
          steps: {
            // No test-materialize step → baseOid = null
            "implementer": [makeStepRunWithOid(CANDIDATE_OID)],
          },
        }),
      ),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts"],
      diffFiles: [],
      baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe("TC-008: listCommitChangedFiles unavailable で constrained floor に対し fail-closed になる", () => {
  it("TC-008: listCommitChangedFiles unavailable → materializedTests unknown → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: "unavailable", // listCommitChangedFiles unavailable
      diffFiles: [],
      baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe("TC-009: 二 OID diff unavailable で constrained floor に対し fail-closed になる", () => {
  it("TC-009: diffPathsBetweenCommits unavailable → freeze unknown → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts"],
      diffFiles: "unavailable", // diffPathsBetweenCommits unavailable
      baseTestResults: [{ file: "tests/unit/foo.test.ts", passed: false }],
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe("TC-010: runTestsAtCommit unavailable で constrained floor に対し fail-closed になる", () => {
  it("TC-010: runTestsAtCommit unavailable → base-red unknown → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: ["tests/unit/foo.test.ts"],
      diffFiles: [], // frozen intact
      baseTestResults: "unavailable", // runTestsAtCommit unavailable
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe("TC-011: materialized test 0 件で constrained floor に対し fail-closed になる", () => {
  it("TC-011: listCommitChangedFiles returns empty → 0 materialized tests → fail-closed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const assuranceRuntime = makeFakeRuntime({
      changedFiles: [], // 0 materialized test files (empty commit or all excluded paths)
      diffFiles: [],
      baseTestResults: [],
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-019 (subset): Regression — non-floor-path jobs still merge even with
// assuranceRuntime injected (gate is only activated on floor path match).
// ---------------------------------------------------------------------------

describe("TC-019 (provenance subset): floor gate is no-op for non-matching paths", () => {
  it("TC-019: PR touches only non-protected paths → merge proceeds regardless of assuranceRuntime", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps(42)),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const { runPostMergeCleanup } = await import("../../../../src/core/archive/post-merge-cleanup.js");
    (runPostMergeCleanup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const client = makeGitHubClient({
      // PR only touches non-protected paths → floor gate is not activated
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["src/core/foo.ts", "tests/unit/foo.test.ts"],
        truncated: false,
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    // Even with a "bad" assuranceRuntime (unavailable everywhere), non-protected path means no floor check
    const assuranceRuntime = makeFakeRuntime({
      changedFiles: "unavailable",
      diffFiles: "unavailable",
      baseTestResults: "unavailable",
    });

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(0);
    expect(client.mergePullRequest).toHaveBeenCalled();
  });
});
