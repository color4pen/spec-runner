/**
 * Tests for merge-then-archive orchestrator.
 *
 * T-01 (TC-004): archiveRecorded+MERGED job runs runPostMergeCleanup and returns exitCode 0
 * T-02 (TC-002): archiveRecorded+unmerged job is resolved and does not return "No job found"
 * TC-001: runArchiveOrchestrator is called with deferArchivedTransition: true (status stays awaiting-archive)
 * TC-004: archiveRecorded + MERGED → markJobArchived + cleanup (crash resume)
 * TC-005: !archiveRecorded + MERGED → order error escalation; no cleanup, no markJobArchived
 * TC-006: fresh merge success → markJobArchived called before runPostMergeCleanup
 * TC-014: merge-during-wait → markJobArchived called before cleanup (integrity check not invoked)
 * TC-015: merge escalation → markJobArchived NOT called, cleanup NOT called
 * TC-016: markJobArchived throws → warning emitted, cleanup still runs
 * T-PMI-01: postMergeVerify set + integrity fail → exit code 1 escalation;
 *            runPostMergeCleanup NOT called; escalation reports merge as MERGED
 * T-PMI-02: postMergeVerify set + integrity pass → runPostMergeCleanup called; exit code 0
 * T-PMI-03: postMergeVerify unset/empty → integrity module not invoked; existing flow unchanged
 * T-PMI-04 (TC-004): archiveRecorded+MERGED resume path does not invoke integrity check
 * TC-015 (old): merge-during-wait path with postMergeVerify set → integrity check not invoked
 * TC-017: designLayer is forwarded to runArchiveOrchestrator in the --with-merge path
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
    listWithSourceDirs: vi.fn(),
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

vi.mock("../../finish/job-state-update.js", () => ({
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
import { runMergeThenArchive } from "../merge-then-archive.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import { runArchiveOrchestrator } from "../orchestrator.js";
import { runPostMergeCleanup } from "../post-merge-cleanup.js";
import { runPostMergeIntegrityCheck } from "../post-merge-integrity.js";
import { stderrWrite } from "../../../logger/stdout.js";
import { markJobArchived } from "../../finish/job-state-update.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "test-job";
const FAKE_JOB_ID = "aaaabbbb-0000-0000-0000-000000000001";
const FAKE_BRANCH = "fix/test-job-aaaabbbb";
const FAKE_PR_NUMBER = 42;

/**
 * sourceChangeDir for a job whose change folder is in the active location
 * (not yet recorded into archive/).
 * archiveRecorded = path.basename(path.dirname(ACTIVE_SOURCE_CHANGE_DIR)) === "archive"
 *                 = path.basename("/repo/specrunner/changes") === "archive"
 *                 = "changes" === "archive" → false
 */
const ACTIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/${FAKE_SLUG}`;

/**
 * sourceChangeDir for a job whose change folder has been moved into archive/
 * (archive recording complete, --with-merge path, merge not yet done).
 * archiveRecorded = path.basename(path.dirname(ARCHIVE_SOURCE_CHANGE_DIR)) === "archive"
 *                 = path.basename("/repo/specrunner/changes/archive") === "archive"
 *                 = "archive" === "archive" → true
 */
const ARCHIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/archive/2026-01-01-${FAKE_SLUG}`;

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

/** Return a ListedJobEntry array with a single active (non-archived) entry. */
function makeActiveEntries(stateOverrides: Partial<JobState> = {}) {
  return [{ state: makeState(stateOverrides), sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR }];
}

/** Return a ListedJobEntry array with a single archive-recorded entry. */
function makeArchiveEntries(stateOverrides: Partial<JobState> = {}) {
  return [{ state: makeState(stateOverrides), sourceChangeDir: ARCHIVE_SOURCE_CHANGE_DIR }];
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
// Tests: archive-recorded job resume paths
// ---------------------------------------------------------------------------

describe("merge-then-archive — archive-recorded job resume paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: archive-recorded (sourceChangeDir in archive/) with awaiting-archive status
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
  });

  /**
   * T-01 / TC-004: archiveRecorded + MERGED → post-merge transition + cleanup.
   * The change folder is already in archive/ (archiveRecorded = true).
   * PR is already MERGED. This is the crash-resume path (e.g. crash after merge, before cleanup).
   */
  it("T-01: archiveRecorded+MERGED job runs markJobArchived + runPostMergeCleanup and returns exitCode 0", async () => {
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

    // markJobArchived must have been called (post-merge transition)
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, FAKE_CWD);

    // runArchiveOrchestrator must NOT have been called (archive already recorded — MERGED path short-circuits)
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();

    // listWithSourceDirs must have been called with includeArchived: true
    expect(vi.mocked(JobStateStore.listWithSourceDirs)).toHaveBeenCalledWith(FAKE_CWD, { includeArchived: true });
  });

  /**
   * T-02 / TC-002: archiveRecorded + unmerged → job is resolved (not "No job found"),
   * proceeds to Step 3 (idempotent re-record).
   * Simulates re-run after merge failure: folder is in archive/, status awaiting-archive.
   */
  it("T-02: archiveRecorded+unmerged job is resolved and does not return 'No job found'", async () => {
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
      expect((result as { exitCode: 2; message: string }).message).not.toMatch(/No job found/);
    }

    // listWithSourceDirs must have been called with includeArchived: true
    expect(vi.mocked(JobStateStore.listWithSourceDirs)).toHaveBeenCalledWith(FAKE_CWD, { includeArchived: true });
  });
});

// ---------------------------------------------------------------------------
// Tests: "archive recorded" signal separates crash-resume from order-error
// ---------------------------------------------------------------------------

describe("merge-then-archive — archiveRecorded vs !archiveRecorded signal (TC-004, TC-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
  });

  /**
   * TC-004: archiveRecorded (archive/ dir) + PR merged = crash-resume path.
   * markJobArchived runs + cleanup runs.
   */
  it("TC-004: archiveRecorded + MERGED → markJobArchived + cleanup (crash resume); integrity NOT invoked", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    const result = await runMergeThenArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
      postMergeVerify: ["bun run test"],
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, FAKE_CWD);
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
    // Integrity check must NOT have been invoked (crash-resume, not fresh-merge path)
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
    // runArchiveOrchestrator must NOT have been called
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
  });

  /**
   * TC-005: !archiveRecorded (active dir) + PR merged = order error.
   * The PR was merged before archive recording → escalation; no cleanup, no markJobArchived.
   */
  it("TC-005: !archiveRecorded + MERGED → order error escalation; no cleanup, no markJobArchived", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    const result = await runMergeThenArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(1);
    expect("escalation" in result && (result as { escalation: string }).escalation).toMatch(/merged before archive/i);
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: post-merge transition (markJobArchived) placement
// ---------------------------------------------------------------------------

describe("merge-then-archive — post-merge transition (TC-001, TC-006, TC-014, TC-015, TC-016)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: active (non-archived) entry
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(runPostMergeIntegrityCheck).mockResolvedValue({ ok: true });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  /**
   * TC-001: runArchiveOrchestrator is called with deferArchivedTransition: true.
   * Verifies that status stays at awaiting-archive during record (not transitioned early).
   */
  it("TC-001: Step 3 calls runArchiveOrchestrator with deferArchivedTransition: true", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
    });

    await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledWith(
      expect.objectContaining({ deferArchivedTransition: true }),
      expect.any(Function),
    );
  });

  /**
   * TC-006: fresh merge success → markJobArchived called before runPostMergeCleanup.
   */
  it("TC-006: fresh merge success → markJobArchived called before runPostMergeCleanup", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
    });

    const callOrder: string[] = [];
    vi.mocked(markJobArchived).mockImplementation(async () => {
      callOrder.push("markJobArchived");
      return undefined as unknown as JobState;
    });
    vi.mocked(runPostMergeCleanup).mockImplementation(async () => {
      callOrder.push("runPostMergeCleanup");
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
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    expect(callOrder).toEqual(["markJobArchived", "runPostMergeCleanup"]);
  });

  /**
   * TC-014: merge-during-wait path → markJobArchived called before cleanup.
   * integrity check NOT invoked (merge-during-wait path).
   */
  it("TC-014: merge-during-wait → markJobArchived called before cleanup; integrity NOT invoked", async () => {
    const getPullRequest = vi.fn()
      .mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", headSha: "abc1234" })
      .mockResolvedValueOnce({ state: "MERGED" });
    const githubClient = makeGithubClient({ getPullRequest });

    const callOrder: string[] = [];
    vi.mocked(markJobArchived).mockImplementation(async () => {
      callOrder.push("markJobArchived");
      return undefined as unknown as JobState;
    });
    vi.mocked(runPostMergeCleanup).mockImplementation(async () => {
      callOrder.push("runPostMergeCleanup");
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
        postMergeVerify: ["bun run test"],
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    expect(callOrder).toEqual(["markJobArchived", "runPostMergeCleanup"]);
    // Integrity check must NOT be invoked on the merge-during-wait path
    expect(vi.mocked(runPostMergeIntegrityCheck)).not.toHaveBeenCalled();
  });

  /**
   * TC-015: merge escalation → markJobArchived NOT called, cleanup NOT called.
   */
  it("TC-015: merge escalation → markJobArchived NOT called, cleanup NOT called", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: false, message: "Method Not Allowed" }),
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
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    expect(result.exitCode).toBe(1);
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });

  /**
   * TC-016: markJobArchived throws (best-effort) → warning emitted, cleanup still runs.
   */
  it("TC-016: markJobArchived throws → warning via stderrWrite, cleanup still runs, exitCode 0", async () => {
    vi.mocked(markJobArchived).mockRejectedValue(new Error("disk full"));

    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
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
        sleepFn: noopSleep,
        nowFn: () => 0,
      },
      () => {},
    );

    // Best-effort: command does not fail even if markJobArchived throws
    expect(result.exitCode).toBe(0);
    // Warning must be emitted
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("Warning") && m.toLowerCase().includes("archived"))).toBe(true);
    // Cleanup still runs
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
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
    // Default: active (non-archived) entry with awaiting-archive status
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
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

  it("TC-015-dup: merge-during-wait path with postMergeVerify set → integrity check not invoked", async () => {
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

  /**
   * T-PMI-04 / TC-004: archiveRecorded + MERGED resume path does not invoke integrity check.
   * Uses archive-recorded sourceChangeDir (status awaiting-archive, folder in archive/).
   */
  it("T-PMI-04: archiveRecorded+MERGED resume path does not invoke integrity check", async () => {
    // Simulate archive-recorded+MERGED scenario (PR merged before this run)
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
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
    // markJobArchived must have been called (post-merge transition on resume path)
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, FAKE_CWD);
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

// ---------------------------------------------------------------------------
// blocked-grace wait loop tests
// ---------------------------------------------------------------------------

describe("merge-then-archive — blocked-grace wait loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(runPostMergeIntegrityCheck).mockResolvedValue({ ok: true });
  });

  it("TBG-01: success + BLOCKED → next poll CLEAN → merge proceeds (exitCode 0)", async () => {
    // First loop iteration sees BLOCKED; second sees CLEAN.
    // nowFn always returns 0 so grace never expires.
    const getPullRequest = vi.fn()
      .mockResolvedValueOnce({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }) // initial pre-archive check
      .mockResolvedValueOnce({
        state: "OPEN",
        mergeStateStatus: "BLOCKED",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }) // loop iteration 1 — still BLOCKED
      .mockResolvedValueOnce({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: "abc1234",
      }); // loop iteration 2 — CLEAN, proceed to merge

    const githubClient = makeGithubClient({
      getPullRequest,
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
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
        sleepFn: noopSleep,
        nowFn: () => 0,
        waitTimeoutMs: null,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(githubClient.mergePullRequest)).toHaveBeenCalled();
    // No branch-protection escalation
    if ("escalation" in result) {
      expect((result as { escalation: string }).escalation).not.toMatch(/branch protection/);
    }
  });

  it("TBG-02: success + BLOCKED → grace exhausted → branch-protection escalation (exitCode 1)", async () => {
    // getPullRequest always returns BLOCKED; grace expires on second success+BLOCKED observation.
    const getPullRequest = vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "BLOCKED",
      mergeable: "MERGEABLE",
      headSha: "abc1234",
    });

    const mergePullRequest = vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" });

    const githubClient = makeGithubClient({
      getPullRequest,
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 1, failing: [], pending: [] }),
      mergePullRequest,
    });

    // nowFn call order:
    //   1. start = nowFn()                          → 0
    //   2. grace check (1st success+BLOCKED): now   → 0  → elapsed = 0 < 30_000 → sleep+continue
    //   3. grace check (2nd success+BLOCKED): now   → 31_000 → elapsed = 31_000 >= 30_000 → escalation
    const nowFn = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(31_000);

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        sleepFn: noopSleep,
        nowFn,
        waitTimeoutMs: null,
      },
      () => {},
    );

    expect(result.exitCode).toBe(1);
    expect("escalation" in result && result.escalation).toMatch(/merge gate \(branch protection\)/);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("TBG-03: conflict (DIRTY) escalation is unchanged (regression)", async () => {
    const getPullRequest = vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "DIRTY",
      mergeable: "MERGEABLE",
      headSha: "abc1234",
    });

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
        sleepFn: noopSleep,
        nowFn: () => 0,
        waitTimeoutMs: null,
      },
      () => {},
    );

    expect(result.exitCode).toBe(1);
    expect("escalation" in result && result.escalation).toMatch(/merge gate \(conflict\)/);
  });

  it("TBG-04: check failure escalation is unchanged (regression)", async () => {
    const getPullRequest = vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeable: "MERGEABLE",
      headSha: "abc1234",
    });

    const getCheckStatus = vi.fn().mockResolvedValue({
      state: "failure",
      total: 1,
      failing: ["ci/test"],
      pending: [],
    });

    const githubClient = makeGithubClient({ getPullRequest, getCheckStatus });

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        sleepFn: noopSleep,
        nowFn: () => 0,
        waitTimeoutMs: null,
      },
      () => {},
    );

    expect(result.exitCode).toBe(1);
    expect("escalation" in result && result.escalation).toMatch(/check status \(failed checks\)/);
  });

  it("TBG-05: none-check grace path is unchanged — CI-less repo proceeds to merge (regression)", async () => {
    // getCheckStatus always returns "none"; grace expires on second observation.
    const getPullRequest = vi.fn().mockResolvedValue({
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeable: "MERGEABLE",
      headSha: "abc1234",
    });

    const getCheckStatus = vi.fn().mockResolvedValue({
      state: "none",
      total: 0,
      failing: [],
      pending: [],
    });

    const mergePullRequest = vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" });

    const githubClient = makeGithubClient({ getPullRequest, getCheckStatus, mergePullRequest });

    // nowFn call order:
    //   1. start = nowFn()                             → 0
    //   2. noneGraceStart set (1st none): now          → 0  → elapsed = 0 < 60_000 → sleep+continue
    //   3. none grace check (2nd none): now            → 61_000 → elapsed = 61_000 >= 60_000 → break → merge
    const nowFn = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(61_000);

    const result = await runMergeThenArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
        sleepFn: noopSleep,
        nowFn,
        waitTimeoutMs: null,
      },
      () => {},
    );

    expect(result.exitCode).toBe(0);
    expect(mergePullRequest).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Structural CI detection integration tests
// TC-001 (must)  CI-present → fail-closed → timeout escalation
// TC-002 (must)  no workflow definition → CI-less → merge after grace
// TC-003 (must)  schedule-only workflow → CI-less → merge after grace
// TC-004 (must)  git ls-tree exits non-zero → inspection-failed → fail-closed → escalation
// TC-015 (must)  archiveSha undefined → ls-tree not invoked → CI-present → escalation
// TC-016 (must)  CI detection cached — ls-tree invoked exactly once across all poll iterations
// TC-017 (should) BLOCKED escalation fires before CI detection is consulted
// TC-018 (should) CI-present timeout escalation message content
// TC-019 (should) no merge/cleanup/markJobArchived on CI-present timeout path
// TC-023 (could)  mergeWaitTimeoutMs null + CI-present → deadline check skipped → loop continues
// ---------------------------------------------------------------------------

describe("merge-then-archive — structural CI detection", () => {
  // -------------------------------------------------------------------------
  // Shared constants
  // -------------------------------------------------------------------------

  /** Matches the headSha returned by runArchiveOrchestrator mock below. */
  const ARCHIVE_SHA = "abc1234";

  const PUSH_WORKFLOW_BLOB_SHA = "cafebabe00000001";
  /** git ls-tree output with a single push-trigger .yml blob. */
  const PUSH_WORKFLOW_LS_TREE =
    `100644 blob ${PUSH_WORKFLOW_BLOB_SHA}\t.github/workflows/ci.yml\n`;
  /** Workflow file content that contains a push: trigger. */
  const PUSH_WORKFLOW_CONTENT =
    `name: CI\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n`;

  const SCHEDULE_WORKFLOW_BLOB_SHA = "cafebabe00000002";
  /** git ls-tree output with a single schedule-only .yml blob. */
  const SCHEDULE_WORKFLOW_LS_TREE =
    `100644 blob ${SCHEDULE_WORKFLOW_BLOB_SHA}\t.github/workflows/nightly.yml\n`;
  /** Workflow file content that contains only schedule: (no push/pull_request). */
  const SCHEDULE_WORKFLOW_CONTENT =
    `name: Nightly\non:\n  schedule:\n    - cron: '0 2 * * *'\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Build a SpawnFn that dispatches on git subcommand.
   * Returns the default `{ exitCode: 0, stdout: "", stderr: "" }` for any
   * non-git or unknown git call so existing spawn paths are not disrupted.
   */
  function makeCiSpawn(opts: {
    lsTreeStdout?: string;
    lsTreeExitCode?: number;
    catFileBody?: string;
    catFileExitCode?: number;
  }): SpawnFn {
    return vi.fn().mockImplementation(
      async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "ls-tree") {
          return { exitCode: opts.lsTreeExitCode ?? 0, stdout: opts.lsTreeStdout ?? "", stderr: "" };
        }
        if (cmd === "git" && args[0] === "cat-file") {
          return { exitCode: opts.catFileExitCode ?? 0, stdout: opts.catFileBody ?? "", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );
  }

  /** Count `git ls-tree` invocations on a spawn mock. */
  function lsTreeCallCount(spawnFn: SpawnFn): number {
    const mock = spawnFn as ReturnType<typeof vi.fn>;
    return (mock.mock.calls as [string, string[], unknown][]).filter(
      ([cmd, args]) => cmd === "git" && args[0] === "ls-tree",
    ).length;
  }

  /**
   * Build a GitHubClient configured for the "none-rollup stays forever" scenario:
   * - getPullRequest returns OPEN/CLEAN/headSha=ARCHIVE_SHA on every call
   * - getCheckStatus returns "none" on every call
   * - mergePullRequest is a tracked spy (returns merged: true if called)
   */
  function makeNoneRollupClient(
    clientOverrides: Partial<GitHubClient> = {},
  ): GitHubClient {
    return makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        mergeable: "MERGEABLE",
        headSha: ARCHIVE_SHA,
      }),
      getCheckStatus: vi.fn().mockResolvedValue({
        state: "none",
        total: 0,
        failing: [],
        pending: [],
      }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
      ...clientOverrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    // Default: runArchiveOrchestrator returns exitCode 0 with a defined archiveSha
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: ARCHIVE_SHA });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  // ─── TC-001 ────────────────────────────────────────────────────────────────
  it(
    "TC-001: push/pull_request workflow present → rollup none stays past grace → " +
    "mergeWaitTimeoutMs exceeded → exitCode 1 escalation; mergePullRequest not called",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const githubClient = makeNoneRollupClient();

      // nowFn:
      //   [0] start=0
      //   [1] iter1 grace: now=0, elapsed=0 < 60_000 → sleep+continue
      //   [2+] iter2 grace: now=61_000 ≥ 60_000 → detect CI (CI-present);
      //        deadline check: 61_000 - 0 = 61_000 ≥ 60_000 (waitTimeoutMs) → escalation
      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 60_000,
        },
        () => {},
      );

      // Must escalate (fail-closed), never merge
      expect(result.exitCode).toBe(1);
      expect("escalation" in result && result.escalation).toBeTruthy();
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-002 ────────────────────────────────────────────────────────────────
  it(
    "TC-002: repo with no workflow definition → CI-less (no-workflows) → " +
    "merge proceeds after none-check grace",
    async () => {
      // git ls-tree returns empty → no blobs → no-workflows → CI-less
      const spawnFn = makeCiSpawn({ lsTreeStdout: "" });
      const mergePullRequest = vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" });
      const githubClient = makeNoneRollupClient({ mergePullRequest });

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: null,
        },
        () => {},
      );

      expect(result.exitCode).toBe(0);
      expect(mergePullRequest).toHaveBeenCalled();
    },
  );

  // ─── TC-003 ────────────────────────────────────────────────────────────────
  it(
    "TC-003: schedule-only workflow (no push/pull_request trigger) → CI-less (no-trigger) → " +
    "merge proceeds after none-check grace",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: SCHEDULE_WORKFLOW_LS_TREE,
        catFileBody: SCHEDULE_WORKFLOW_CONTENT,
      });
      const mergePullRequest = vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" });
      const githubClient = makeNoneRollupClient({ mergePullRequest });

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: null,
        },
        () => {},
      );

      expect(result.exitCode).toBe(0);
      expect(mergePullRequest).toHaveBeenCalled();
    },
  );

  // ─── TC-004 ────────────────────────────────────────────────────────────────
  it(
    "TC-004: git ls-tree exits non-zero (bad ref) → inspection-failed → " +
    "fail-closed (CI-present) → escalation; mergePullRequest not called",
    async () => {
      // archiveSha is defined (ARCHIVE_SHA) but ls-tree fails (e.g. bad ref)
      const spawnFn = makeCiSpawn({ lsTreeExitCode: 128 });
      const githubClient = makeNoneRollupClient();

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 60_000,
        },
        () => {},
      );

      expect(result.exitCode).toBe(1);
      expect("escalation" in result && result.escalation).toBeTruthy();
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-015 ────────────────────────────────────────────────────────────────
  it(
    "TC-015: runArchiveOrchestrator returns headSha: undefined → " +
    "git ls-tree not invoked (detection skipped) → treated as CI-present (fail-closed) → " +
    "mergeWaitTimeoutMs exceeded → exitCode 1 escalation",
    async () => {
      // Simulate archive commit SHA unavailable
      vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: undefined });

      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });

      // getPullRequest returns a valid headSha (archive SHA matching is skipped when archiveSha=undefined)
      const githubClient = makeNoneRollupClient({
        getPullRequest: vi.fn().mockResolvedValue({
          state: "OPEN",
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          headSha: "some-other-sha",
        }),
      });

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 60_000,
        },
        () => {},
      );

      // Must escalate (fail-closed)
      expect(result.exitCode).toBe(1);
      // git ls-tree must NOT have been invoked — detection is skipped when archiveSha is undefined
      expect(lsTreeCallCount(spawnFn)).toBe(0);
      // No merge
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-016 ────────────────────────────────────────────────────────────────
  it(
    "TC-016: CI presence detection is computed at most once per job — " +
    "git ls-tree spawn invoked exactly once across all poll iterations",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const githubClient = makeNoneRollupClient();

      // Drive 3 poll iterations in the grace-exhausted, CI-present path before timeout fires.
      // Designed for up to 2 nowFn calls per grace-exhausted iteration:
      //   call[i] for grace check, call[i+1] for CI-present deadline check.
      // Whether the implementation uses 1 or 2 nowFn calls per iteration, this sequence
      // ensures ≥2 iterations with CI-present (cached) before the deadline fires.
      const nowFn = vi.fn()
        .mockReturnValueOnce(0)        // start
        .mockReturnValueOnce(0)        // iter1 grace: 0 < 60_000 → sleep
        .mockReturnValueOnce(61_000)   // iter2 grace: 61_000 ≥ 60_000 → detect CI (ls-tree called here)
        .mockReturnValueOnce(61_000)   // iter2 possible deadline: 61_000 < 120_000 → sleep
        .mockReturnValueOnce(90_000)   // iter3 grace: ≥ 60_000, CI cached (no ls-tree)
        .mockReturnValueOnce(90_000)   // iter3 possible deadline: 90_000 < 120_000 → sleep
        .mockReturnValueOnce(121_000)  // iter4 grace: ≥ 60_000, CI cached (no ls-tree)
        .mockReturnValue(121_000);     // iter4 deadline: 121_000 ≥ 120_000 → escalation

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 120_000,
        },
        () => {},
      );

      expect(result.exitCode).toBe(1);
      // Detection must have been cached — ls-tree invoked exactly once
      expect(lsTreeCallCount(spawnFn)).toBe(1);
      // No merge
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-017 ────────────────────────────────────────────────────────────────
  it(
    "TC-017: BLOCKED+none past grace → BLOCKED branch-protection escalation fires " +
    "before CI detection is consulted; git ls-tree not invoked",
    async () => {
      // Workflow is present in spawn, but isBlocked=true should fire first
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const githubClient = makeGithubClient({
        getPullRequest: vi.fn().mockResolvedValue({
          state: "OPEN",
          mergeStateStatus: "BLOCKED",
          mergeable: "MERGEABLE",
          headSha: ARCHIVE_SHA,
        }),
        getCheckStatus: vi.fn().mockResolvedValue({
          state: "none",
          total: 0,
          failing: [],
          pending: [],
        }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" }),
      });

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)    // start
        .mockReturnValueOnce(0)    // iter1 grace: 0 < 60_000 → sleep
        .mockReturnValue(61_000);  // iter2 grace: ≥ 60_000, isBlocked=true → BLOCKED escalation (before CI detect)

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: null,
        },
        () => {},
      );

      // Branch-protection escalation fired
      expect(result.exitCode).toBe(1);
      expect("escalation" in result && result.escalation).toMatch(/branch protection/i);
      // git ls-tree must NOT have been invoked — BLOCKED path fires before CI detection
      expect(lsTreeCallCount(spawnFn)).toBe(0);
      // No merge
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-018 ────────────────────────────────────────────────────────────────
  it(
    "TC-018: CI-present timeout escalation message states push/pull_request workflow " +
    "is present, PR was not merged, and provides the resume command",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const githubClient = makeNoneRollupClient();

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 60_000,
        },
        () => {},
      );

      expect(result.exitCode).toBe(1);
      const esc = "escalation" in result ? (result as { escalation: string }).escalation : "";
      expect(esc).toBeTruthy();

      // Must mention push/pull_request workflow trigger
      expect(esc).toMatch(/push|pull_request/);

      // Must indicate the PR was NOT merged (fail-closed)
      expect(esc.toLowerCase()).toMatch(/not merged|no merge|fail.closed|did not merge/);

      // Must include the specrunner resume command
      expect(esc).toContain(`specrunner job archive --with-merge ${FAKE_SLUG}`);
    },
  );

  // ─── TC-019 ────────────────────────────────────────────────────────────────
  it(
    "TC-019: CI-present timeout → mergePullRequest not called, " +
    "runPostMergeCleanup not called, markJobArchived not called",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const githubClient = makeNoneRollupClient();

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(61_000);

      const result = await runMergeThenArchive(
        {
          slug: FAKE_SLUG,
          cwd: FAKE_CWD,
          spawn: spawnFn,
          fs: makeFs(),
          githubClient,
          owner: "test",
          repo: "repo",
          sleepFn: noopSleep,
          nowFn,
          waitTimeoutMs: 60_000,
        },
        () => {},
      );

      expect(result.exitCode).toBe(1);
      // None of these side-effects must occur on the CI-present timeout path
      expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
      expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
      expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    },
  );

  // ─── TC-023 ────────────────────────────────────────────────────────────────
  it(
    "TC-023: waitTimeoutMs null + CI-present → overall deadline check skipped → " +
    "loop continues sleeping without merging",
    async () => {
      const spawnFn = makeCiSpawn({
        lsTreeStdout: PUSH_WORKFLOW_LS_TREE,
        catFileBody: PUSH_WORKFLOW_CONTENT,
      });
      const mergePullRequest = vi.fn().mockResolvedValue({ merged: true, message: "squash-merged" });
      const githubClient = makeNoneRollupClient({ mergePullRequest });

      // sleepFn: allow 2 sleep calls then throw to bound the test
      const sleepFn = vi.fn()
        .mockResolvedValueOnce(undefined) // sleep in iter1 (grace still running)
        .mockResolvedValueOnce(undefined) // sleep in iter2+ (CI-present, null deadline → no escalation → sleep)
        .mockRejectedValue(new Error("TC-023: test boundary — loop iterated past deadline check"));

      const nowFn = vi.fn()
        .mockReturnValueOnce(0)       // start
        .mockReturnValueOnce(0)       // iter1 grace: not exhausted
        .mockReturnValueOnce(61_000)  // iter2 grace: exhausted, detect CI
        .mockReturnValue(62_000);     // subsequent calls (null deadline: no extra nowFn needed)

      let threw = false;
      try {
        await runMergeThenArchive(
          {
            slug: FAKE_SLUG,
            cwd: FAKE_CWD,
            spawn: spawnFn,
            fs: makeFs(),
            githubClient,
            owner: "test",
            repo: "repo",
            sleepFn,
            nowFn,
            waitTimeoutMs: null,
          },
          () => {},
        );
      } catch {
        threw = true;
      }

      // The test boundary (sleepFn reject) is expected — loop was still running
      expect(threw).toBe(true);
      // mergePullRequest must NOT have been called — CI-present path never merges
      expect(mergePullRequest).not.toHaveBeenCalled();
    },
  );
});
