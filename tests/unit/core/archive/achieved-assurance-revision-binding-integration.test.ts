/**
 * Integration tests for assurance-revision-binding via runMergeThenArchive.
 *
 * Tests the revision-binding behaviors (scenario / spec 凍結・承認を revision OID に束縛する):
 *
 * After remove-bite-evidence:
 * - testDerivation depends solely on scenario binding (test-cases.md OID cross-compare).
 * - biteEvidence is removed; floors use testDerivation and specReview.
 * - AssuranceProvenanceRuntime is narrowed to { readFileAtCommit } only.
 * - MergeThenArchiveInput no longer has a `config` field.
 *
 * TC-008: scenario time-boundary — test-cases.md@anchor ≠ @HEAD → testDerivation floor exitCode 1
 * TC-009: 協調改竄 — scenario tampered at HEAD → commit-OID binding catches mismatch → exitCode 1
 * TC-010: specReview time-boundary — spec.md binding → floor exitCode 1 / 0
 * TC-011: fail-closed 網羅 — various absent / unavailable conditions → floor exitCode 1
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
    headSha: "archive-head-sha-rev-int-001",
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
const CWD = "/tmp/test-repo-rev-int";
const SLUG = "my-slug";
const ARCHIVE_HEAD_SHA = "archive-head-sha-rev-int-001"; // the finalHeadOid in runMergeThenArchive

/** OID assigned to the test-case-gen confirmation commit. */
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-rev-int-001";

/** OID assigned to the spec-review confirmation commit. */
const SPEC_REVIEW_OID = "spec-review-commit-sha-rev-int-001";

// Scenario test-cases.md content
const SCENARIO_ANCHOR_CONTENT = "# Test Cases (anchor)\n\n## TC-001: sample\nAnchor scenario content.\n";
const SCENARIO_TAMPERED_CONTENT = "# Test Cases (TAMPERED)\n\n## TC-001: sample (MODIFIED)\nTampered after test-case-gen.\n";

// Spec content
const SPEC_ANCHOR_CONTENT = "# Spec\n\n## Requirements\nOriginal spec.\n";
const SPEC_TAMPERED_CONTENT = "# Spec\n\n## Requirements (CHANGED)\nSpec changed after spec-review.\n";

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
 * Defaults model a "fully achieved" job:
 *   - test-cases.md: same SCENARIO_ANCHOR_CONTENT at both TEST_CASE_GEN_OID and ARCHIVE_HEAD_SHA
 *   - spec.md: same SPEC_ANCHOR_CONTENT at both SPEC_REVIEW_OID and ARCHIVE_HEAD_SHA
 */
function makeFakeRuntime(options: {
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";   // @TEST_CASE_GEN_OID
  testCasesMdAtHead?: CommitFileResult | "unavailable";     // @ARCHIVE_HEAD_SHA
  specMdAtAnchor?: CommitFileResult | "unavailable";        // @SPEC_REVIEW_OID
  specMdAtHead?: CommitFileResult | "unavailable";          // @ARCHIVE_HEAD_SHA
} = {}) {
  // Defaults
  const defaultTestCasesMdAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT,
  };
  const defaultTestCasesMdAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT, // same as anchor (freeze intact by default)
  };
  const defaultSpecMdAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT,
  };
  const defaultSpecMdAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT, // same as anchor (binding intact by default)
  };

  const resolve = <T>(opt: T | "unavailable" | undefined, def: T): T | { kind: "unavailable"; reason: string } =>
    opt === "unavailable"
      ? { kind: "unavailable" as const, reason: "fake unavailable" }
      : (opt ?? def);

  const resolvedTcMdAnchor = resolve(options.testCasesMdAtAnchor, defaultTestCasesMdAtAnchor);
  const resolvedTcMdHead = resolve(options.testCasesMdAtHead, defaultTestCasesMdAtHead);
  const resolvedSpecAnchor = resolve(options.specMdAtAnchor, defaultSpecMdAtAnchor);
  const resolvedSpecHead = resolve(options.specMdAtHead, defaultSpecMdAtHead);

  return {
    async readFileAtCommit(
      oid: string, pathSuffix: string, _cwd: string,
    ): Promise<CommitFileResult> {
      // OID-discriminated test-cases.md
      if (pathSuffix.endsWith("test-cases.md")) {
        if (oid === TEST_CASE_GEN_OID) return resolvedTcMdAnchor as CommitFileResult;
        if (oid === ARCHIVE_HEAD_SHA) return resolvedTcMdHead as CommitFileResult;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for test-cases.md` };
      }
      // OID-discriminated spec.md
      if (pathSuffix.endsWith("spec.md")) {
        if (oid === SPEC_REVIEW_OID) return resolvedSpecAnchor as CommitFileResult;
        if (oid === ARCHIVE_HEAD_SHA) return resolvedSpecHead as CommitFileResult;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for spec.md` };
      }
      return { kind: "unavailable", reason: `fake: unknown suffix ${pathSuffix}` };
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

function makeSpecReviewStepRun(verdict: string | null, commitOid?: string, attempt = 1): StepRun {
  const run = {
    attempt,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:20.000Z",
    endedAt: "2026-01-01T00:00:25.000Z",
    ...(commitOid !== undefined ? { commitOid } : {}),
  };
  return run as unknown as StepRun;
}

/**
 * Build a job state with test-case-gen step (commitOid) for revision-binding tests.
 * Optionally includes spec-review step with commitOid.
 * No test-materialize step (absorbed into implementer per absorb-test-materialize).
 */
function makeJobStateWithRevisionOids(options: {
  prNumber?: number;
  type?: string;
  testCaseGenOid?: string | null;  // undefined → no test-case-gen step
  specReviewRuns?: Array<{ verdict: string | null; commitOid?: string }>;
  overrides?: Record<string, unknown>;
} = {}) {
  const {
    prNumber = 42,
    type = "new-feature",
    specReviewRuns,
    overrides = {},
  } = options;
  // Use "in" check so explicit undefined means "no step" (destructuring default would override it).
  const testCaseGenOid = "testCaseGenOid" in options ? options.testCaseGenOid : TEST_CASE_GEN_OID;

  const steps: Record<string, StepRun[]> = {
    "implementer": [makeStepRunWithOid("impl-commit-sha-rev-int-001")],
  };

  if (testCaseGenOid !== undefined) {
    const run = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:45.000Z",
      endedAt: "2026-01-01T00:00:50.000Z",
      ...(testCaseGenOid !== null ? { commitOid: testCaseGenOid } : {}),
    };
    steps["test-case-gen"] = [run as unknown as StepRun];
  }

  if (specReviewRuns !== undefined) {
    steps["spec-review"] = specReviewRuns.map((r, i) =>
      makeSpecReviewStepRun(r.verdict, r.commitOid, i + 1),
    );
  }

  return {
    jobId: "rev-int-test-job",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    synthesizedCommits: ["bootstrap-commit-sha-rev-int-001"],
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

function makeActiveEntry(state: ReturnType<typeof makeJobStateWithRevisionOids>) {
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
// TC-008: scenario time-boundary — test-cases.md@anchor ≠ @HEAD → testDerivation floor exitCode 1
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   OID cross-compare を同一 commit（finalHeadOid のみ）に戻すと、
//   test-cases.md@HEAD = S'（改竄）でも hash(S') == hash(S') で一致し
//   testDerivation achieved → exitCode 0 になる（誤ったパス）。
//   commit-OID 束縛（TEST_CASE_GEN_OID 跨ぎ）が T1 の歯。
// ---------------------------------------------------------------------------

describe("TC-008: scenario time-boundary — test-cases.md@anchor ≠ @HEAD → testDerivation floor exitCode 1", () => {
  it(
    "TC-008: test-cases.md@testCaseGenOid=S vs @finalHeadOid=S'（不一致）→ testDerivation:frozen floor で exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithRevisionOids({ type: "new-feature" })),
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

      // Tampered: test-cases.md at HEAD = S' (different from anchor S)
      const assuranceRuntime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT, // S (anchor)
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT, // S' (tampered at HEAD)
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

      // T1: cross-commit comparison detects S ≠ S' → testDerivation absent → fail-closed
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: 協調改竄 — scenario tampered at HEAD → commit-OID binding catches mismatch
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   同一 commit 自己整合チェックでは test-cases.md@HEAD = S' でも通過してしまう。
//   commit-OID 束縛は test-cases.md@testCaseGenOid（S）を読むため S ≠ S' を検出し exitCode 1。
// ---------------------------------------------------------------------------

describe("TC-009: 協調改竄 — scenario tampered at HEAD → commit-OID binding catches mismatch → exitCode 1", () => {
  it(
    "TC-009: test-cases.md@HEAD=S'（改竄）でも commit-OID 束縛が S ≠ S' を検出して exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithRevisionOids({ type: "new-feature" })),
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

      // Scenario tampered: test-cases.md at HEAD = S' while anchor = S
      const assuranceRuntime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT, // S (anchor unchanged)
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT, // S' (tampered at HEAD)
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

      // Commit-OID binding detects S ≠ S' → testDerivation absent → fail-closed
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: specReview time-boundary — spec.md binding → floor exitCode 1 / 0
// ---------------------------------------------------------------------------

describe("TC-010: specReview time-boundary — spec.md binding → floor exitCode 1 / 0", () => {
  it(
    "TC-010/negative: verdict=approved + spec.md@specReviewOid=SPEC + @HEAD=SPEC'（不一致）→ exitCode 1",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithRevisionOids({
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
      });

      const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

      // spec.md changed after spec-review
      const assuranceRuntime = makeFakeRuntime({
        specMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/spec.md`,
          content: SPEC_ANCHOR_CONTENT,
        },
        specMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
          content: SPEC_TAMPERED_CONTENT, // changed after review
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
        minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
        assuranceRuntime,
      });

      // spec.md mismatch after review → specReview absent → exitCode 1
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );

  it(
    "TC-010/positive: verdict=approved + spec.md 不変（anchor↔HEAD 一致）→ exitCode 0 + mergePullRequest 呼び出し",
    async () => {
      const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
      (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeActiveEntry(makeJobStateWithRevisionOids({
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

      // spec.md unchanged between spec-review and HEAD (defaults: same content)
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
        minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
        assuranceRuntime,
      });

      // spec.md unchanged → specReview achieved → exitCode 0, merge proceeds
      expect(result.exitCode).toBe(0);
      expect(client.mergePullRequest).toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-011: fail-closed 網羅 — various absent / unavailable conditions → floor exitCode 1
// ---------------------------------------------------------------------------

describe("TC-011: fail-closed 網羅 — floor 統合 exitCode 1", () => {
  it("TC-011(i): testCaseGenOid 欠落（test-case-gen step なし）→ testDerivation floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      // No test-case-gen step
      makeActiveEntry(makeJobStateWithRevisionOids({ testCaseGenOid: undefined })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_TEST_DERIVATION,
      assuranceRuntime: makeFakeRuntime(),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(ii): specReviewOid 欠落（commitOid なし spec-review run）→ specReview floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithRevisionOids({
        specReviewRuns: [{ verdict: "approved" }], // approved but NO commitOid
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime(),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(iii): test-cases.md@testCaseGenOid unavailable → testDerivation floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithRevisionOids({ type: "new-feature" })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_TEST_DERIVATION,
      assuranceRuntime: makeFakeRuntime({
        testCasesMdAtAnchor: "unavailable", // cannot read test-cases.md at anchor OID
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(iv): test-cases.md@finalHeadOid unavailable → testDerivation floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithRevisionOids({ type: "new-feature" })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_TEST_DERIVATION,
      assuranceRuntime: makeFakeRuntime({
        testCasesMdAtHead: "unavailable", // cannot read test-cases.md at HEAD OID
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(v): spec.md@specReviewOid unavailable → specReview floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithRevisionOids({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime({
        specMdAtAnchor: "unavailable", // cannot read spec.md at specReviewOid
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(vi): spec.md@finalHeadOid unavailable → specReview floor で exitCode 1", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeActiveEntry(makeJobStateWithRevisionOids({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      })),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    (runArchiveOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValue({
      exitCode: 0, headSha: ARCHIVE_HEAD_SHA,
    });

    const client = makeGitHubClient({
      listPullRequestFiles: vi.fn().mockResolvedValue({
        files: ["architecture/core/design.md"], truncated: false,
      }),
    });

    const { runMergeThenArchive } = await import("../../../../src/core/archive/merge-then-archive.js");

    const result = await (runMergeThenArchive as (...args: unknown[]) => Promise<{ exitCode: number }>)({
      slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
      owner: "user", repo: "repo", waitTimeoutMs: 60_000,
      minimumAssurance: FLOOR_SPEC_REVIEW_REQUIRED,
      assuranceRuntime: makeFakeRuntime({
        specMdAtHead: "unavailable", // cannot read spec.md at finalHeadOid
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});
