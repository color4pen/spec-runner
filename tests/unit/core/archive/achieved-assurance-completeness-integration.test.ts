/**
 * Integration tests for achieved-assurance-completeness via runMergeThenArchive.
 *
 * These tests exercise the floor gate (Step 3.6) through the full merge-then-archive
 * pipeline, verifying that scenario-freeze and spec-review behaviors block or allow
 * merges as expected.
 *
 * After remove-bite-evidence:
 * - testDerivation depends solely on scenario binding (test-cases.md content match).
 * - biteEvidence is removed; testDerivation and specReview are the two dimensions.
 * - AssuranceProvenanceRuntime is narrowed to { readFileAtCommit } only.
 * - MergeThenArchiveInput no longer has a `config` field.
 *
 * TC-001: scenario tampered → testDerivation:frozen floor fail-closed (exitCode 1)
 *         DESTRUCTIVE INVARIANT: removing commit-OID binding would allow tamper to pass.
 * TC-002: scenario intact → testDerivation achieved → exitCode 0, merge proceeds
 * TC-006: latest spec-review verdict not approved → specReview:required fail-closed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

vi.mock("../../../../src/core/archive/cleanup.js", () => ({
  runArchiveCleanup: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUCCESS_ROLLUP: CheckRollup = { state: "success", total: 1, failing: [], pending: [] };
const CWD = "/tmp/test-repo-aac";
const SLUG = "my-slug";
const ARCHIVE_HEAD_SHA = "archive-head-sha-aac-001";

// Commit OID anchors for revision-binding checks (D1 / D2).
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-aac-001";
const SPEC_REVIEW_OID = "spec-review-commit-sha-aac-001";

// Predefined test-cases.md and spec.md content.
const TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: sample\n";
const TEST_CASES_TAMPERED = "# Test Cases\n\n## TC-001: TAMPERED\n";
const SPEC_CONTENT = "# Spec\n\n## Requirement: foo\n";

// Floor configs (properly typed — no biteEvidence)
const FLOOR_TEST_DERIVATION = {
  protectedPaths: ["architecture/**"],
  testDerivation: "frozen" as const,
};

const FLOOR_SPEC_REVIEW_REQUIRED = {
  protectedPaths: ["architecture/**"],
  specReview: "required" as const,
};

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fake AssuranceProvenanceRuntime with only readFileAtCommit (narrowed interface).
 *
 * readFileAtCommit dispatches by OID + path suffix:
 *   test-cases.md: TEST_CASE_GEN_OID → testCasesMdAtAnchor; ARCHIVE_HEAD_SHA → testCasesMdAtHead
 *   spec.md:       SPEC_REVIEW_OID   → specMdAtAnchor;      ARCHIVE_HEAD_SHA → specMdAtHead
 *   Default: same content at anchor and HEAD (fully-achieved by default).
 */
function makeFakeRuntime(options: {
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";
  testCasesMdAtHead?: CommitFileResult | "unavailable";
  specMdAtAnchor?: CommitFileResult | "unavailable";
  specMdAtHead?: CommitFileResult | "unavailable";
} = {}) {
  const defaultTcResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/test-cases.md`,
    content: TEST_CASES_CONTENT,
  };
  const defaultSpecResult: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/spec.md`,
    content: SPEC_CONTENT,
  };

  const resolve = (opt: CommitFileResult | "unavailable" | undefined, def: CommitFileResult): CommitFileResult =>
    opt === "unavailable"
      ? { kind: "unavailable", reason: "fake unavailable" }
      : (opt ?? def);

  const resolvedTcAtAnchor = resolve(options.testCasesMdAtAnchor, defaultTcResult);
  const resolvedTcAtHead = resolve(options.testCasesMdAtHead, defaultTcResult);
  const resolvedSpecAtAnchor = resolve(options.specMdAtAnchor, defaultSpecResult);
  const resolvedSpecAtHead = resolve(options.specMdAtHead, defaultSpecResult);

  return {
    async readFileAtCommit(
      oid: string, pathSuffix: string, _cwd: string,
    ): Promise<CommitFileResult> {
      if (pathSuffix.endsWith("test-cases.md")) {
        if (oid === TEST_CASE_GEN_OID) return resolvedTcAtAnchor;
        if (oid === ARCHIVE_HEAD_SHA) return resolvedTcAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for test-cases.md` };
      }
      if (pathSuffix.endsWith("spec.md")) {
        if (oid === SPEC_REVIEW_OID) return resolvedSpecAtAnchor;
        if (oid === ARCHIVE_HEAD_SHA) return resolvedSpecAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for spec.md` };
      }
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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
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

function makeSpecReviewStepRun(verdict: string | null, attempt = 1, commitOid?: string): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:30.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    ...(commitOid !== undefined ? { commitOid } : {}),
  } as StepRun;
}

/**
 * Build a job state with configurable type, spec-review runs, and step history.
 * Includes test-case-gen step by default (commitOid = TEST_CASE_GEN_OID) for D1 binding.
 * No test-materialize step (absorbed into implementer per absorb-test-materialize).
 */
function makeJobStateWithSteps(options: {
  prNumber?: number;
  type?: string;
  specReviewRuns?: Array<{ verdict: string | null; commitOid?: string }>;
  overrides?: Record<string, unknown>;
} = {}) {
  const { prNumber = 42, type = "new-feature", specReviewRuns, overrides = {} } = options;

  const steps: Record<string, StepRun[]> = {
    "test-case-gen": [makeStepRunWithOid(TEST_CASE_GEN_OID)],
    "implementer": [makeStepRunWithOid("impl-commit-sha-aac-001")],
  };

  if (specReviewRuns !== undefined) {
    steps["spec-review"] = specReviewRuns.map((r, i) =>
      makeSpecReviewStepRun(r.verdict, i + 1, r.commitOid),
    );
  }

  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    synthesizedCommits: ["bootstrap-commit-sha-aac-001"],
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
// TC-001: scenario tampered → testDerivation:frozen floor fail-closed
//
// DESTRUCTIVE INVARIANT: removing commit-OID cross-compare (falling back to same-commit
// self-consistency) would make a tampered test-cases.md appear intact, causing
// testDerivation to be falsely achieved and exitCode to be 0.
// ---------------------------------------------------------------------------

describe("TC-001: scenario tampered → testDerivation:frozen floor fail-closed", () => {
  it(
    "TC-001: test-cases.md@testCaseGenOid ≠ @finalHeadOid → testDerivation absent → exitCode 1",
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

      // Tampered: test-cases.md at HEAD differs from anchor
      const assuranceRuntime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_CONTENT, // original at anchor
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: TEST_CASES_TAMPERED, // tampered at HEAD
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
        minimumAssurance: FLOOR_TEST_DERIVATION,
        assuranceRuntime,
      });

      // TC-001: scenario tampered → testDerivation absent → fail-closed
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: scenario intact → testDerivation achieved → exitCode 0, merge proceeds
// ---------------------------------------------------------------------------

describe("TC-002: scenario intact → testDerivation achieved → exitCode 0", () => {
  it(
    "TC-002: test-cases.md content same at anchor and HEAD → testDerivation=frozen → exitCode 0, merge proceeds",
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

      // Intact: test-cases.md same content at anchor and HEAD (default runtime returns TEST_CASES_CONTENT for both)
      const assuranceRuntime = makeFakeRuntime();

      const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
        slug: SLUG,
        cwd: CWD,
        spawn: spawnFn,
        fs: fsMock,
        githubClient: client,
        owner: "user",
        repo: "repo",
        waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_TEST_DERIVATION,
        assuranceRuntime,
      });

      // TC-002: scenario intact → testDerivation achieved → merge proceeds
      expect(result.exitCode).toBe(0);
      expect(client.mergePullRequest).toHaveBeenCalled();
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
      assuranceRuntime: makeFakeRuntime(),
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
      assuranceRuntime: makeFakeRuntime(),
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
      assuranceRuntime: makeFakeRuntime(),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-006/positive: spec-review verdict=approved + commitOid + spec.md unchanged → specReview achieved → floor satisfied", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithSteps({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
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
      assuranceRuntime: makeFakeRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(client.mergePullRequest).toHaveBeenCalled();
  });
});
