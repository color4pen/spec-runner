/**
 * Integration tests for assurance-revision-binding via runMergeThenArchive.
 *
 * Tests the NEW behaviors introduced by assurance-revision-binding:
 * scenario / spec 凍結・承認を revision（commit OID）に束縛する。
 *
 * TC-008: scenario time-boundary — floor 統合 exitCode 1（T1 歯）
 * TC-009: 協調改竄 — floor 統合 exitCode 1（T2 歯）
 * TC-010: specReview time-boundary — floor 統合 exitCode 1 / 0（T4 歯）
 * TC-011: fail-closed 網羅 — floor 統合 exitCode 1（T5 歯）
 * TC-012: 実 config anti-regression — scopedTestCommand 未設定で fail-closed（T6）
 *
 * These tests will be RED until the implementation binds scenario/spec freezes
 * to anchor commit OIDs rather than same-commit self-consistency.
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
    headSha: "archive-head-sha-rev-int-001",
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
const CWD = "/tmp/test-repo-rev-int";
const SLUG = "my-slug";
const BASE_OID = "base-commit-sha-rev-int-001";
const CANDIDATE_OID = "candidate-commit-sha-rev-int-001";
const ARCHIVE_HEAD_SHA = "archive-head-sha-rev-int-001"; // the finalHeadOid in runMergeThenArchive

/** OID assigned to the test-case-gen confirmation commit. */
const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-rev-int-001";

/** OID assigned to the spec-review confirmation commit. */
const SPEC_REVIEW_OID = "spec-review-commit-sha-rev-int-001";

// Scenario test-cases.md content
const SCENARIO_ANCHOR_CONTENT = "# Test Cases (anchor)\n\n## TC-001: sample\nAnchor scenario content.\n";
const SCENARIO_ANCHOR_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(SCENARIO_ANCHOR_CONTENT, "utf8"))
  .digest("hex");

const SCENARIO_TAMPERED_CONTENT = "# Test Cases (TAMPERED)\n\n## TC-001: sample (MODIFIED)\nTampered after test-case-gen.\n";
const SCENARIO_TAMPERED_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(SCENARIO_TAMPERED_CONTENT, "utf8"))
  .digest("hex");

// Spec content
const SPEC_ANCHOR_CONTENT = "# Spec\n\n## Requirements\nOriginal spec.\n";
const SPEC_TAMPERED_CONTENT = "# Spec\n\n## Requirements (CHANGED)\nSpec changed after spec-review.\n";

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

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build events.jsonl content with a test-case-gen lineage record.
 * Used to configure what the OLD implementation (events.jsonl-based) sees.
 * The NEW implementation ignores events.jsonl entirely.
 */
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
 * Build a fake AssuranceProvenanceRuntime with OID-discriminated readFileAtCommit.
 *
 * Defaults model a "fully achieved" job:
 *   - test-cases.md: same SCENARIO_ANCHOR_CONTENT at both TEST_CASE_GEN_OID and ARCHIVE_HEAD_SHA
 *   - spec.md: same SPEC_ANCHOR_CONTENT at both SPEC_REVIEW_OID and ARCHIVE_HEAD_SHA
 *   - events.jsonl: valid frozen hash (for OLD impl compat)
 *   - base:red, HEAD:green, blob freeze intact
 */
function makeFakeRuntime(options: {
  changedFiles?: string[] | "unavailable";
  diffFiles?: string[] | "unavailable";
  baseTestResults?: IsolatedTestResult;
  headTestResults?: IsolatedTestResult;
  // OID-discriminated test-cases.md
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";   // @TEST_CASE_GEN_OID
  testCasesMdAtHead?: CommitFileResult | "unavailable";     // @ARCHIVE_HEAD_SHA
  // OID-discriminated spec.md
  specMdAtAnchor?: CommitFileResult | "unavailable";        // @SPEC_REVIEW_OID
  specMdAtHead?: CommitFileResult | "unavailable";          // @ARCHIVE_HEAD_SHA
  // events.jsonl at ARCHIVE_HEAD_SHA (for backward compat with OLD impl)
  eventsJsonlAtHead?: CommitFileResult | "unavailable";
} = {}) {
  const {
    changedFiles = ["tests/unit/foo.test.ts"],
    diffFiles = [],
    baseTestResults = { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: false }] },
    headTestResults = { kind: "ran", results: [{ file: "tests/unit/foo.test.ts", passed: true }] },
    testCasesMdAtAnchor,
    testCasesMdAtHead,
    specMdAtAnchor,
    specMdAtHead,
    eventsJsonlAtHead,
  } = options;

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
  const defaultEventsJsonlAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
    content: makeEventsJsonl(SCENARIO_ANCHOR_HASH), // valid frozen hash for OLD impl compat
  };

  const resolve = <T>(opt: T | "unavailable" | undefined, def: T): T | { kind: "unavailable"; reason: string } =>
    opt === "unavailable"
      ? { kind: "unavailable" as const, reason: `fake unavailable` }
      : (opt ?? def);

  const resolvedTcMdAnchor = resolve(testCasesMdAtAnchor, defaultTestCasesMdAtAnchor);
  const resolvedTcMdHead = resolve(testCasesMdAtHead, defaultTestCasesMdAtHead);
  const resolvedSpecAnchor = resolve(specMdAtAnchor, defaultSpecMdAtAnchor);
  const resolvedSpecHead = resolve(specMdAtHead, defaultSpecMdAtHead);
  const resolvedEvents = resolve(eventsJsonlAtHead, defaultEventsJsonlAtHead);

  return {
    async listCommitChangedFiles(_oid: string, _cwd: string): Promise<ChangedFilesResult> {
      if (changedFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake listCommitChangedFiles unavailable" };
      }
      return { kind: "success", files: changedFiles as string[] };
    },
    async diffPathsBetweenCommits(
      _base: string, _head: string, _paths: string[], _cwd: string,
    ): Promise<ChangedFilesResult> {
      if (diffFiles === "unavailable") {
        return { kind: "unavailable", reason: "fake diffPathsBetweenCommits unavailable" };
      }
      return { kind: "success", files: diffFiles as string[] };
    },
    async runTestsAtCommit(
      oid: string, _files: string[], _cwd: string, _config: unknown,
    ): Promise<IsolatedTestResult> {
      if (oid === ARCHIVE_HEAD_SHA) return headTestResults;
      return baseTestResults;
    },
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
      // events.jsonl: only at ARCHIVE_HEAD_SHA (for OLD impl compat)
      if (pathSuffix.endsWith("events.jsonl")) {
        if (oid === ARCHIVE_HEAD_SHA) return resolvedEvents as CommitFileResult;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for events.jsonl` };
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
    "test-materialize": [makeStepRunWithOid(BASE_OID)],
    "implementer": [makeStepRunWithOid(CANDIDATE_OID)],
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
// TC-008: scenario time-boundary — floor 統合 exitCode 1（T1 歯）
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   跨ぎ比較を同一 commit（finalHeadOid のみ）に戻すと T1 が通ってしまう。
//   events.jsonl@HEAD の frozen hash を ARCHIVE_HEAD_SHA で書き換えれば、
//   OLD 実装（同一 commit 自己整合）では hash(S') == hash(test-cases.md@HEAD=S') で一致し
//   exitCode 0 になる（誤ったパス）。commit-OID 束縛（TEST_CASE_GEN_OID 跨ぎ）が T1 の歯。
// ---------------------------------------------------------------------------

describe("TC-008: scenario time-boundary — floor 統合 exitCode 1（T1 歯）", () => {
  it(
    "TC-008: test-cases.md@testCaseGenOid=S と @finalHeadOid=S'（不一致）→ biteEvidence:required floor で exitCode 1",
    async () => {
      // DESTRUCTIVE INVARIANT: 同一 commit 比較に戻すと: events.jsonl@HEAD frozen hash = hash(S'),
      // test-cases.md@HEAD = S' → 一致 → scenarioIntact → testDerivation="frozen" → biteEvidence achieved
      // → exitCode 0（誤り）。commit-OID 跨ぎ比較（TEST_CASE_GEN_OID）がこれを弾く歯。

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
      // events.jsonl at HEAD has hash(S') — this fools the OLD implementation
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
        eventsJsonlAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(SCENARIO_TAMPERED_HASH), // hash(S') — fools OLD impl
        },
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

      // T1: cross-commit comparison detects S ≠ S' → fail-closed
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: 協調改竄 — floor 統合 exitCode 1（T2 歯）
//
// DESTRUCTIVE INVARIANT (破壊確認):
//   events.jsonl frozen hash と finalHeadOid content を比較する旧構造（同一 commit 自己整合）に戻すと、
//   test-cases.md@HEAD = S' かつ events.jsonl@HEAD frozen hash = hash(S') → 一致 → exitCode 0（誤り）。
//   commit-OID 束縛は test-cases.md@testCaseGenOid（S）を読むため、協調改竄を検出して exitCode 1。
// ---------------------------------------------------------------------------

describe("TC-009: 協調改竄 — floor 統合 exitCode 1（T2 歯）", () => {
  it(
    "TC-009: test-cases.md@HEAD=S'（改竄）+ events.jsonl@HEAD frozen hash=hash(S') でも commit-OID 束縛が exitCode 1",
    async () => {
      // DESTRUCTIVE INVARIANT: events.jsonl frozen hash と test-cases.md@HEAD を同一 commit で比較する旧構造では、
      // 攻撃者が両者を同時に S' に書き換えると hash(S') == hash(S') で通る（#850 の穴）。
      // commit-OID 束縛: test-cases.md@testCaseGenOid（S）vs @HEAD（S'）で不一致 → exitCode 1。

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

      // Cooperative tampering: both test-cases.md@HEAD and events.jsonl@HEAD are tampered to S'
      const assuranceRuntime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT, // S (anchor unchanged)
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT, // S' (tampered)
        },
        eventsJsonlAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/events.jsonl`,
          content: makeEventsJsonl(SCENARIO_TAMPERED_HASH), // cooperative: hash(S') — fools OLD impl
        },
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

      // T2: cooperative tampering detected via commit-OID binding → fail-closed
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: specReview time-boundary — floor 統合 exitCode 1 / 0（T4 歯）
// ---------------------------------------------------------------------------

describe("TC-010: specReview time-boundary — floor 統合 exitCode 1 / exitCode 0（T4 歯）", () => {
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
        config: { version: 1, agents: {} },
      });

      // T4 negative: spec.md mismatch after review → specReview absent → exitCode 1
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
        config: { version: 1, agents: {} },
      });

      // T4 positive: spec.md unchanged → specReview achieved → exitCode 0, merge proceeds
      expect(result.exitCode).toBe(0);
      expect(client.mergePullRequest).toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-011: fail-closed 網羅 — floor 統合 exitCode 1（T5 歯）
// ---------------------------------------------------------------------------

describe("TC-011: fail-closed 網羅 — floor 統合 exitCode 1（T5 歯）", () => {
  it("TC-011(i): testCaseGenOid 欠落（test-case-gen step なし）→ biteEvidence floor で exitCode 1", async () => {
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
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime: makeFakeRuntime(),
      config: { version: 1, agents: {} },
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
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(iii): test-cases.md@testCaseGenOid unavailable → biteEvidence floor で exitCode 1", async () => {
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
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime: makeFakeRuntime({
        testCasesMdAtAnchor: "unavailable", // cannot read test-cases.md at anchor OID
      }),
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("TC-011(iv): test-cases.md@finalHeadOid unavailable → biteEvidence floor で exitCode 1", async () => {
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
      minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
      assuranceRuntime: makeFakeRuntime({
        testCasesMdAtHead: "unavailable", // cannot read test-cases.md at HEAD OID
      }),
      config: { version: 1, agents: {} },
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
      config: { version: 1, agents: {} },
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
      config: { version: 1, agents: {} },
    });

    expect(result.exitCode).toBe(1);
    expect(client.mergePullRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-012: 実 config anti-regression — scopedTestCommand 未設定で fail-closed（T6）
//
// #848 の歯（scopedTestCommand 未設定 → runTestsAtCommit unavailable → biteEvidence absent）を
// 退行させないことを固定する。revision-binding の変更後も同様に fail-closed。
// ---------------------------------------------------------------------------

describe("TC-012: 実 config anti-regression — scopedTestCommand 未設定で fail-closed（T6）", () => {
  it(
    "TC-012: scopedTestCommand 未設定 → runTestsAtCommit unavailable → biteEvidence:required floor で exitCode 1",
    async () => {
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

      // Simulate real config: scopedTestCommand absent → runTestsAtCommit always unavailable
      const assuranceRuntime = makeFakeRuntime({
        changedFiles: ["tests/unit/foo.test.ts"],
        diffFiles: [],
        // runTestsAtCommit unavailable for both base and HEAD (no scopedTestCommand)
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
        slug: SLUG, cwd: CWD, spawn: spawnFn, fs: fsMock, githubClient: client,
        owner: "user", repo: "repo", waitTimeoutMs: 60_000,
        minimumAssurance: FLOOR_BITE_EVIDENCE_REQUIRED,
        assuranceRuntime,
        // Real repo config: no scopedTestCommand
        config: { version: 1, agents: {}, verification: { commands: ["bun run test"] } },
      });

      // TC-012: anti-regression — runTestsAtCommit unavailable must not authorize merge (#848 preserved)
      expect(result.exitCode).toBe(1);
      expect(client.mergePullRequest).not.toHaveBeenCalled();
    },
  );
});
