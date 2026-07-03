/**
 * Tests for merge-then-archive orchestrator — archived job resume paths.
 *
 * T-01: archived+MERGED job runs runPostMergeCleanup and returns exitCode 0
 * T-02: archived+unmerged job is resolved and does not return No job found
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobState } from "../../../state/schema.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { FinishFs } from "../../finish/types.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn(),
  resolveWorktreePathForArchive: vi.fn().mockResolvedValue(null),
}));

vi.mock("../post-merge-cleanup.js", () => ({
  runPostMergeCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../logger/stdout.js", () => ({
  logResult: vi.fn(),
  stderrWrite: vi.fn(),
}));

// Import after mocks are set up
import { runMergeThenArchive } from "../merge-then-archive.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import { runArchiveOrchestrator } from "../orchestrator.js";
import { runPostMergeCleanup } from "../post-merge-cleanup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "test-job";
const FAKE_JOB_ID = "aaaabbbb-0000-0000-0000-000000000001";
const FAKE_BRANCH = "fix/test-job-aaaabbbb";
const FAKE_PR_NUMBER = 42;

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: FAKE_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `/specrunner/changes/${FAKE_SLUG}/request.md`,
      title: "Test Job",
      type: "bug-fix",
      slug: FAKE_SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: FAKE_BRANCH,
    history: [],
    error: null,
    pullRequest: { number: FAKE_PR_NUMBER, url: `https://github.com/test/repo/pull/${FAKE_PR_NUMBER}` },
    ...overrides,
  } as JobState;
}

function makeGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyPath: vi.fn().mockResolvedValue(false),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "merged" }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 0, url: "" }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as GitHubClient;
}

function makeSpawn(): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
}

function makeFs(): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("{}"),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("merge-then-archive — archived job resume paths", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState({ status: "archived" })]);
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
  });

  it("T-01: archived+MERGED job runs runPostMergeCleanup and returns exitCode 0", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });
    vi.mocked(runArchiveOrchestrator).mockClear();

    const result = await runMergeThenArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);

    // runPostMergeCleanup must have been called (cleanup path)
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();

    // runArchiveOrchestrator must NOT have been called (cleanup short-circuit, no re-record)
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();

    // list() must have been called with includeArchived: true
    expect(vi.mocked(JobStateStore.list)).toHaveBeenCalledWith(FAKE_CWD, { includeArchived: true });
  });

  it("T-02: archived+unmerged job is resolved and does not return No job found", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE" }),
    });

    // Return a stub failure from runArchiveOrchestrator so the function exits
    // early (after the job-found gate passes) without running the full CI-wait loop
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 1, escalation: "stub-failure" });

    const result = await runMergeThenArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    // The job WAS found — result must NOT be "No job found"
    expect(result.exitCode).not.toBe(2);
    if (result.exitCode === 2) {
      // Narrowed type: message exists when exitCode === 2
      expect((result as { exitCode: 2; message: string }).message).not.toMatch(/No job found/);
    }

    // list() must have been called with includeArchived: true
    expect(vi.mocked(JobStateStore.list)).toHaveBeenCalledWith(FAKE_CWD, { includeArchived: true });
  });
});
