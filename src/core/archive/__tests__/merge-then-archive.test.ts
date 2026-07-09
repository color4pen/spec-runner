/**
 * Tests for merge-then-archive orchestrator — archived job resume paths
 * and post-merge integrity check wiring.
 *
 * T-01: archived+MERGED job runs runPostMergeCleanup and returns exitCode 0
 * T-02: archived+unmerged job is resolved and does not return No job found
 * T-PMI-01: postMergeVerify set + integrity fail → exit code 1 escalation;
 *            runPostMergeCleanup NOT called; escalation reports merge as MERGED
 * T-PMI-02: postMergeVerify set + integrity pass → runPostMergeCleanup called; exit code 0
 * T-PMI-03: postMergeVerify unset/empty → integrity module not invoked; existing flow unchanged
 * T-PMI-04: already-merged resume path does not invoke integrity check
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobState } from "../../../state/schema.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { FinishFs } from "../../finish/types.js";
import type { ResolvedDesignLayer } from "../../../config/schema.js";

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

vi.mock("../post-merge-integrity.js", () => ({
  runPostMergeIntegrityCheck: vi.fn().mockResolvedValue({ ok: true }),
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
import { runPostMergeIntegrityCheck } from "../post-merge-integrity.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "test-job";
const FAKE_JOB_ID = "aaaabbbb-0000-0000-0000-000000000001";
const FAKE_BRANCH = "fix/test-job-aaaabbbb";
const FAKE_PR_NUMBER = 42;

/** Instant no-op sleep for tests that need to pass through the wait loop. */
const noopSleep = () => Promise.resolve();

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

// ---------------------------------------------------------------------------
// Post-merge integrity check wiring tests
// ---------------------------------------------------------------------------

/**
 * Build a githubClient configured for a fresh merge scenario:
 * - First getPullRequest → OPEN (not yet merged)
 * - getCheckStatus → success
 * - mergePullRequest → merged: true
 * After the merge, getCheckStatus is not called again.
 */
function makeFreshMergeGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return makeGithubClient({
    getPullRequest: vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeable: "MERGEABLE",
      headSha: "abc1234",
    }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
    ...overrides,
  });
}

describe("merge-then-archive — post-merge integrity check wiring", () => {
  beforeEach(() => {
    // Clear all mock call history before each test so counts don't bleed across suites.
    vi.clearAllMocks();
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState({ status: "awaiting-archive" })]);
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(runPostMergeIntegrityCheck).mockResolvedValue({ ok: true });
  });

  it("T-PMI-01: postMergeVerify set + integrity fail → exit code 1 escalation; cleanup not called; escalation says MERGED", async () => {
    const FAKE_ESCALATION =
      "=== specrunner finish: escalation ===\n" +
      "PR #42 was MERGED into main at merge commit abc1234.\n" +
      "NOT rolled back\n" +
      "=====================================";
    vi.mocked(runPostMergeIntegrityCheck).mockResolvedValue({
      ok: false,
      escalation: FAKE_ESCALATION,
    });

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient: makeFreshMergeGithubClient(),
        owner: "test",
        repo: "repo",
        postMergeVerify: ["bun install --frozen-lockfile"],
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(1);
    // Escalation is surfaced
    expect("escalation" in result && result.escalation).toBe(FAKE_ESCALATION);
    // Post-merge cleanup must NOT have been called on integrity failure
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
    // Integrity check WAS called
    expect(vi.mocked(runPostMergeIntegrityCheck)).toHaveBeenCalledWith(
      expect.objectContaining({ commands: ["bun install --frozen-lockfile"], prNumber: FAKE_PR_NUMBER }),
    );
  });

  it("T-PMI-02: postMergeVerify set + integrity pass → runPostMergeCleanup called; exit code 0", async () => {
    vi.mocked(runPostMergeIntegrityCheck).mockResolvedValue({ ok: true });

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient: makeFreshMergeGithubClient(),
        owner: "test",
        repo: "repo",
        postMergeVerify: ["bun install --frozen-lockfile"],
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    // Integrity check was invoked
    expect(vi.mocked(runPostMergeIntegrityCheck)).toHaveBeenCalled();
    // Cleanup was invoked
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
  });

  it("T-PMI-03: postMergeVerify unset → integrity module not invoked; existing flow unchanged", async () => {
    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient: makeFreshMergeGithubClient(),
        owner: "test",
        repo: "repo",
        // postMergeVerify absent
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    // Integrity module NOT invoked
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
    // Cleanup still runs
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
  });

  it("T-PMI-03b: postMergeVerify empty array → integrity module not invoked; existing flow unchanged", async () => {
    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient: makeFreshMergeGithubClient(),
        owner: "test",
        repo: "repo",
        postMergeVerify: [],
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
  });

  it("TC-015: merge-during-wait path with postMergeVerify set → integrity check not invoked", async () => {
    // Initial getPullRequest (before archive recording): OPEN
    // Second getPullRequest (inside the wait loop): MERGED — simulates another process merging
    const getPullRequest = vi.fn()
      .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", headSha: "abc1234" })
      .mockResolvedValueOnce({ state: "MERGED" });
    const githubClient = makeGithubClient({ getPullRequest });

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        postMergeVerify: ["bun install --frozen-lockfile"],
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    // Merge-during-wait path: the merge is not attributed to this execution,
    // so the post-merge integrity check must NOT be invoked.
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
    // Cleanup still runs on the merge-during-wait path.
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
  });

  it("T-PMI-04: already-merged resume path does not invoke integrity check", async () => {
    // Simulate archived+MERGED scenario (PR merged before this run)
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState({ status: "archived" })]);
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        postMergeVerify: ["bun install --frozen-lockfile"],
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    // Integrity check must NOT have been invoked on the resume path
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
    // Cleanup runs (resume path)
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
  });

  it("TC-017: designLayer is forwarded to runArchiveOrchestrator in the --with-merge path", async () => {
    // Verify that topic emission (via designLayer) propagates through the --with-merge route.
    // runMergeThenArchive delegates to runArchiveOrchestrator which handles topic emission;
    // this test confirms the designLayer option reaches that call site.
    const resolvedDesignLayer: ResolvedDesignLayer = {
      enabled: true,
      command: "aozu",
      requireCitationTypes: [],
      topicEmission: true,
    };

    await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient: makeFreshMergeGithubClient(),
        owner: "test",
        repo: "repo",
        designLayer: resolvedDesignLayer,
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledWith(
      expect.objectContaining({ designLayer: resolvedDesignLayer }),
      expect.any(Function),
    );
  });
});
