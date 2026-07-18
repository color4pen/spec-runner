/**
 * Integration tests for achieved-assurance-completeness via runMergeThenArchive.
 *
 * These tests exercise the floor gate (Step 3.6) through the full merge-then-archive
 * pipeline, verifying that the new derivation behaviors (HEAD-green, type gate,
 * spec-review verdict, scenario freeze) block or allow merges as expected.
 *
 * TC-001: base:red but HEAD:red → biteEvidence:required floor is fail-closed (exitCode 1)
 *         DESTRUCTIVE INVARIANT: removing HEAD-green check would cause this to pass (exitCode 0).
 * TC-002: base:red + HEAD:green + scenario frozen + forward type → biteEvidence satisfied
 * TC-005: non-forward type (refactoring/spec-change) with base:red + HEAD:green → fail-closed
 * TC-006: latest spec-review verdict not approved (needs-fix/escalation/run-absent) → fail-closed
 * TC-026: real config (scopedTestCommand absent → runTestsAtCommit unavailable) → fail-closed
 *         (anti-regression: must not break #848 behavior)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import type { GitHubClient, CheckRollup } from "../../../../src/core/port/github-client.js";
import type { StepRun } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: { listWithSourceDirs: vi.fn() },
}));

vi.mock("../../../../src/core/archive/orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn().mockResolvedValue({
    exitCode: 0,
    headSha: "archive-head-sha-aac-001",
  }),
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
const CWD = "/tmp/test-repo-aac";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-aac-001";
const CANDIDATE_OID = "candidate-commit-sha-aac-001";
const ARCHIVE_HEAD_SHA = "archive-head-sha-aac-001";

// Predefined test-cases.md content and hash for scenario freeze.
const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";
const TEST_CASES_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(TEST_CASES_CONTENT, "utf8"))
  .digest("hex");

// Floor configs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLOOR_BITE_EVIDENCE_REQUIRED: any = {
  protectedPaths: ["architecture/**"],
  biteEvidence: "required",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLOOR_SPEC_REVIEW_REQUIRED: any = {
  protectedPaths: ["architecture/**"],
  specReview: "required",
};

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type ChangedFilesResult =
  | { kind: "success"; files: string[] }
  | { kind: "unavailable"; reason: string };

type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

// CommitFileResult is the NEW type added in T-01 (not yet in runtime-strategy.ts).
type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEventsJsonl(frozenHash: string | null): string {
  return JSON.stringify({
    type: "lineage",
    step: "test-case-gen",
    ts: "2026-01-01T00:00:00.000Z",
    outputs: [
      {
        path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
        hash: frozenHash,
      },
    ],
    inputs: [],
  }) + "\n";
}

/**
 * Fake AssuranceProvenanceRuntime with readFileAtCommit for scenario freeze checks.
 *
 * Per-OID runTestsAtCommit:
 *   - BASE_OID → baseTestResults
 *   - ARCHIVE_HEAD_SHA → headTestResults
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
  eventsJsonlResult?: CommitFileResult | "unavailable";
  testCasesMdResult?: CommitFileResult | "unavailable";
} = {}) {
  const {
    changedFiles = ["tests/unit/foo.test.ts"],
    diffFiles = [],
    baseTestResults = { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: true }] },
    eventsJsonlResult,
    testCasesMdResult,
  } = options;

  const defaultEventsResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
    content: makeEventsJsonl(TEST_CASES_HASH),
  };
  const defaultTestCasesMdResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: TEST_CASES_CONTENT,
  };

  const resolvedEvents = eventsJsonlResult === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake events.jsonl unavailable" }
    : (eventsJsonlResult ?? defaultEventsResult);

  const resolvedTestCasesMd = testCasesMdResult === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md unavailable" }
    : (testCasesMdResult ?? defaultTestCasesMdResult);

  return {
    async listCommitChangedFiles(_oid: string, _cwd: string): Promise<ChangedFilesResult> {
      if (changedFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake listCommitChangedFiles unavailable" };
      }
      return { kind: "success", files: changedFiles };
    },
    async diffPathsBetweenCommits(
      _base: string, _head: string, _paths: string[], _cwd: string,
    ): Promise<ChangedFilesResult> {
      if (diffFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake diffPathsBetweenCommits unavailable" };
      }
      return { kind: "success", files: diffFiles };
    },
    async runTestsAtCommit(
      oid: string, _files: string[], _cwd: string, _config: unknown,
    ): Promise<IsolatedTestResult> {
      if (oid === ARCHIVE_HEAD_SHA) {
        return headTestResults;
      }
      return baseTestResults;
    },
    // TC-001/TC-002/TC-003: The new implementation calls readFileAtCommit for scenario freeze.
    // Tests that supply this method simulate a properly-equipped runtime.
    async readFileAtCommit(
      _oid: string, pathSuffix: string, _cwd: string,
    ): Promise<CommitFileResult> {
      if (pathSuffix.endsWith("events.jsonl")) return resolvedEvents;
      if (pathSuffix.endsWith("test-cases.md")) return resolvedTestCasesMd;
      return { kind: "unavailable", reason: `unknown suffix: ${pathSuffix}` };
    },
  };
}

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
      headRefName: `change/${SLUG}-abc12345`,
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

function makeSpecReviewStepRun(verdict: string | null, attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:30.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
  } as StepRun;
}

/**
 * Build a job state with configurable type, spec-review runs, and step history.
 */
function makeJobStateWithSteps(options: {
  prNumber?: number;
  type?: string;
  specReviewRuns?: Array<{ verdict: string | null }>;
  overrides?: Record<string, unknown>;
} = {}) {
  const { prNumber = 42, type = "new-feature", specReviewRuns, overrides = {} } = options;

  const steps: Record<string, StepRun[]> = {
    "test-materialize": [makeStepRunWithOid(BASE_OID)],
    "implementer": [makeStepRunWithOid(CANDIDATE_OID)],
  };

  if (specReviewRuns !== undefined) {
    steps["spec-review"] = specReviewRuns.map((r, i) =>
      makeSpecReviewStepRun(r.verdict, i + 1),
    );
  }

  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    request: {
      path: `/repo/specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type,
      slug: SLUG,
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    steps,
    pullRequest: {
      url: `https://github.com/user/repo/pull/${prNumber}`,
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
// TC-001: base:red but HEAD:red → biteEvidence:required floor fail-closed
//
// DESTRUCTIVE INVARIANT: if HEAD-green measurement is removed from derivation,
// base:red alone would satisfy biteEvidence and this test would PASS (exitCode 0).
// The test MUST fail (exitCode 1) to confirm HEAD-green is required.
// ---------------------------------------------------------------------------

describe("TC-001: base:red but HEAD:red → biteEvidence:required fail-closed", () => {
  it(
    "TC-001: base:red + HEAD:red (still red at finalHeadOid) → exitCode 1, mergePullRequest not called",
    async () => {
      // DESTRUCTIVE INVARIANT: removing HEAD-green check → exitCode 0 (test passes for wrong reason).
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps({ type: "new-feature" })),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // base: all red, HEAD: still all red (implementation did not fix the tests)
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [], // blob freeze intact
        baseTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
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

      // TC-001: HEAD still red → biteEvidence absent → fail-closed
      // DESTRUCTIVE INVARIANT: without HEAD-green check, exitCode would be 0 (incorrect pass).
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: base:red + HEAD:green + scenario frozen + forward type → biteEvidence satisfied
// ---------------------------------------------------------------------------

describe("TC-002: base:red + HEAD:green + scenario frozen + forward → floor satisfied", () => {
  it(
    "TC-002: all conditions met → biteEvidence achieved → exitCode 0, mergePullRequest called",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps({ type: "new-feature" })),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
        getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // base: all red, HEAD: all green, scenario frozen (events.jsonl + test-cases.md match)
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [], // blob freeze intact
        baseTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: true }] },
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

      // TC-002: biteEvidence achieved → merge proceeds
      expect(result.exitCode).toBe(0);
      expect(client.mergePullRequest).toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: non-forward type with base:red + HEAD:green → biteEvidence:required fail-closed
// ---------------------------------------------------------------------------

describe("TC-005: non-forward type → biteEvidence:required fail-closed", () => {
  it(
    "TC-005: type=refactoring + base:red + HEAD:green → biteEvidence absent → exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps({ type: "refactoring" })),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // base:red, HEAD:green, scenario frozen — all would satisfy forward strategy
      // but type=refactoring is NOT a forward-strategy type → biteEvidence must be absent
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [],
        baseTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: true }] },
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

      // TC-005: type gate blocks biteEvidence for non-forward type
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );

  it(
    "TC-005b: type=spec-change (this change itself) + base:red + HEAD:green → biteEvidence absent → exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps({ type: "spec-change" })),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

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
        baseTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
        headTestResults: { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: true }] },
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
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: latest spec-review verdict not approved → specReview:required fail-closed
// ---------------------------------------------------------------------------

describe("TC-006: spec-review verdict not approved → specReview:required fail-closed", () => {
  it("TC-006: latest spec-review verdict=needs-fix → specReview absent → exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps({
        specReviewRuns: [{ verdict: "needs-fix" }],
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime() as never,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-006b: latest spec-review verdict=escalation → specReview absent → exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps({
        specReviewRuns: [{ verdict: "escalation" }],
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime() as never,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-006c: no spec-review run at all → specReview absent → exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // State without spec-review runs
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps({
        specReviewRuns: [], // empty
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime() as never,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-006/positive: spec-review verdict=approved → specReview achieved → floor satisfied", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps({
        specReviewRuns: [{ verdict: "approved" }],
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0,
      headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"],
        truncated: false,
      }),
      getCheckStatus: vi.fn().mockResolvedValue(SUCCESS_ROLLUP),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG,
      cwd: CWD,
      spawn: spawnFn,
      fs: fsMock,
      githubClient: client,
      owner: "user",
      repo: "repo",
      waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime() as never,
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(0);
    expect(client.mergePullRequest).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-026: real config anti-regression (scopedTestCommand absent → runTestsAtCommit unavailable)
//
// This verifies that the existing #848 behavior is preserved after adding HEAD-green check.
// With scopedTestCommand absent, runTestsAtCommit returns unavailable for both base and HEAD.
// biteEvidence:required floor must remain fail-closed.
// ---------------------------------------------------------------------------

describe("TC-026: real config (scopedTestCommand absent) → biteEvidence:required fail-closed", () => {
  it(
    "TC-026: runTestsAtCommit unavailable for both base and HEAD → biteEvidence absent → exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithSteps({ type: "new-feature" })),
      ]);

      const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
      (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
        exitCode: 0,
        headSha: ARCHIVE_HEAD_SHA,
      });

      const client = makeGitHubClient({
        listPullRequestFiles: vi.fn().mockResolvedValue({
          files: ["architecture/core/design.md"],
          truncated: false,
        }),
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // Simulate real config: scopedTestCommand absent → runTestsAtCommit always unavailable
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [],
        // Both base and HEAD return unavailable (no scopedTestCommand configured)
        baseTestResults: {
          kind: "unavailable",
          reason: "Cannot scope custom verification.commands to individual test files",
        },
        headTestResults: {
          kind: "unavailable",
          reason: "Cannot scope custom verification.commands to individual test files",
        },
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
        // Real repo config: no scopedTestCommand
        config: { version: 1, agents: {}, verification: { commands: ["bun run test"] } },
      });

      // TC-026: anti-regression — runTestsAtCommit unavailable must not authorize merge (#848 preserved)
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});
