/**
 * Tests for plain archive (runPlainArchive) — archive-state-after-merge contract.
 *
 * TC-011: PR OPEN → orchestrator called / markJobArchived NOT called / runPostMergeCleanup NOT called / exit 0
 * TC-012: archive record pushed to feature branch (orchestrator called for OPEN PR)
 * TC-013: out-of-band MERGED + archiveRecorded → markJobArchived + cleanup / orchestrator NOT called / exit 0
 * TC-014: PR OPEN → runPostMergeCleanup NOT called (merge-before-cleanup invariant)
 * TC-015: PR MERGED + archiveRecorded → orchestrator NOT called (no redundant push)
 * TC-016: PR MERGED + !archiveRecorded → exit 1 escalation / markJobArchived NOT called / cleanup NOT called
 * TC-017: archiveRecorded + OPEN (re-run) → orchestrator called (idempotent) / no transition / exit 0
 * TC-018: plain archive never calls getCheckStatus (CI non-observation pin)
 * TC-019: CI failure does not affect state — archiveRecorded + OPEN re-run → markJobArchived / runPostMergeCleanup / getCheckStatus NOT called
 * TC-020: githubClient absent → orchestrator called / no transition / no cleanup / exit 0
 * TC-021: getPullRequest throws → orchestrator called / no transition / no cleanup / exit 0
 * TC-022: PR-less job → orchestrator called / markJobArchived called / cleanup NOT called / exit 0
 * TC-023: already archived → no-op / exit 0 / no orchestrator / no getPullRequest / no cleanup
 * TC-024: re-run guidance printed in stdout on record success with prNumber
 * TC-025: getCheckStatus / mergePullRequest never called
 * TC-026: runPostMergeCleanup only inside MERGED detection branch
 * TC-040: already canceled → no-op / exit 0
 * TC-041: PR-less job + markJobArchived throws → exit 1 escalation / cleanup NOT called
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

vi.mock("../../finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../logger/stdout.js", () => ({
  logResult: vi.fn(),
  stderrWrite: vi.fn(),
}));

// Import after mocks are set up
import { runPlainArchive } from "../plain-archive.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import { runArchiveOrchestrator } from "../orchestrator.js";
import { runPostMergeCleanup } from "../post-merge-cleanup.js";
import { markJobArchived } from "../../finish/job-state-update.js";
import { stderrWrite } from "../../../logger/stdout.js";

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
 */
const ACTIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/${FAKE_SLUG}`;

/**
 * sourceChangeDir for a job whose change folder has been moved into archive/
 * (archive recording complete, merge not yet done).
 */
const ARCHIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/archive/2026-01-01-${FAKE_SLUG}`;

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

function makeActiveEntries(stateOverrides: Partial<JobState> = {}) {
  return [{ state: makeState(stateOverrides), sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR }];
}

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
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
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

describe("plain archive — PR OPEN path (TC-011, TC-012, TC-014, TC-018, TC-025)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  /**
   * TC-011: PR OPEN → awaiting-archive stays (orchestrator called, no transition)
   */
  it("TC-011: PR OPEN → orchestrator called / markJobArchived NOT called / exit 0", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });

  /**
   * TC-012: archive record pushed to feature branch (orchestrator invoked for OPEN PR)
   */
  it("TC-012: archive record commit pushed via orchestrator for OPEN PR", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    // orchestrator handles commit + push; its invocation confirms the record was attempted
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledWith(
      expect.objectContaining({ slug: FAKE_SLUG, deferArchivedTransition: true }),
      expect.any(Function),
    );
  });

  /**
   * TC-014: PR OPEN → runPostMergeCleanup NOT called (cleanup only after merge)
   */
  it("TC-014: PR OPEN → runPostMergeCleanup NOT called", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });

  /**
   * TC-018: plain archive never calls getCheckStatus (CI non-observation pin)
   */
  it("TC-018: getCheckStatus is never called by plain archive", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(vi.mocked(githubClient.getCheckStatus)).not.toHaveBeenCalled();
  });

  /**
   * TC-025: mergePullRequest never called by plain archive
   */
  it("TC-025: mergePullRequest is never called by plain archive", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(vi.mocked(githubClient.mergePullRequest)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-013, TC-015: PR MERGED + archiveRecorded (out-of-band merge resume)
// ---------------------------------------------------------------------------

describe("plain archive — PR MERGED + archiveRecorded (TC-013, TC-015)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  /**
   * TC-013: out-of-band MERGED + archiveRecorded → markJobArchived + cleanup / orchestrator NOT called
   */
  it("TC-013: MERGED + archiveRecorded → markJobArchived + cleanup; orchestrator NOT called; exit 0", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, FAKE_CWD);
    expect(vi.mocked(runPostMergeCleanup)).toHaveBeenCalled();
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
  });

  /**
   * TC-015: merge 済み PR → orchestrator (push) を試みない
   */
  it("TC-015: MERGED + archiveRecorded → orchestrator NOT invoked (no redundant push)", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-016: PR MERGED + !archiveRecorded (order error)
// ---------------------------------------------------------------------------

describe("plain archive — PR MERGED + !archiveRecorded (TC-016)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Active entry (not yet in archive/)
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-016: MERGED + !archiveRecorded → exit 1 escalation; markJobArchived NOT called; cleanup NOT called", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "MERGED" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(1);
    expect("escalation" in result && result.escalation).toMatch(/merged before archive/i);
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-020: githubClient absent
// ---------------------------------------------------------------------------

describe("plain archive — githubClient absent (TC-020)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-020: githubClient absent → orchestrator called / no transition / no cleanup / exit 0", async () => {
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      // githubClient not provided
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-021: getPullRequest throws
// ---------------------------------------------------------------------------

describe("plain archive — getPullRequest throws (TC-021)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-021: getPullRequest throws → orchestrator called / no transition / no cleanup / exit 0", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockRejectedValue(new Error("network error")),
    });
    vi.mocked(stderrWrite).mockClear();

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
    // Warning should be emitted
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("Warning"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-022: PR-less job → orchestrator + markJobArchived (no cleanup)
// ---------------------------------------------------------------------------

describe("plain archive — PR-less job (TC-022)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue([
      { state: makeState({ pullRequest: undefined }), sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR },
    ]);
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-022: PR-less job → orchestrator called / markJobArchived called / getPullRequest NOT called / cleanup NOT called / exit 0", async () => {
    const githubClient = makeGithubClient();

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, FAKE_CWD);
    expect(vi.mocked(githubClient.getPullRequest)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-023, TC-040: terminal status (archived / canceled) → no-op
// ---------------------------------------------------------------------------

describe("plain archive — terminal status no-op (TC-023, TC-040)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-023: already archived → no-op / exit 0 / no orchestrator / no getPullRequest / no cleanup", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(
      makeActiveEntries({ status: "archived" }),
    );
    const githubClient = makeGithubClient();

    const stdoutCalls: string[] = [];
    const result = await runPlainArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
      },
      (msg) => stdoutCalls.push(msg),
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(githubClient.getPullRequest)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
    expect(stdoutCalls.some((m) => m.includes("finished") || m.includes("archived"))).toBe(true);
  });

  it("TC-040: already canceled → no-op / exit 0 / no orchestrator / no cleanup", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(
      makeActiveEntries({ status: "canceled" }),
    );
    const githubClient = makeGithubClient();

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-024: stdout re-run guidance on record success
// ---------------------------------------------------------------------------

describe("plain archive — stdout guidance (TC-024)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-024: re-run guidance printed in stdout after successful record with prNumber", async () => {
    const stdoutCalls: string[] = [];
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    await runPlainArchive(
      {
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
      },
      (msg) => stdoutCalls.push(msg),
    );

    const combined = stdoutCalls.join("\n");
    // Guidance must mention: re-run after merge
    expect(combined).toMatch(/re.?run|再実行/i);
    // Guidance must reference the archive command
    expect(combined).toContain(`specrunner job archive ${FAKE_SLUG}`);
    // Guidance must mention PR number
    expect(combined).toContain(`${FAKE_PR_NUMBER}`);
  });
});

// ---------------------------------------------------------------------------
// TC-017: archiveRecorded + OPEN (idempotent re-run)
// ---------------------------------------------------------------------------

describe("plain archive — idempotent re-run (TC-017, TC-019)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Archive is recorded but PR is OPEN (typical re-run after push failure/resume)
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-017: archiveRecorded + OPEN → orchestrator called (idempotent) / no transition / exit 0", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    // Orchestrator is called (idempotent — it skips already-done steps internally)
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    // No transition — PR not yet merged
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });

  /**
   * TC-019: archive record push 後に CI が failure でも state は awaiting-archive のまま
   * （再実行シナリオ: archiveRecorded=true, PR OPEN）
   *
   * plain archive は CI を観測しない（getCheckStatus を呼ばない）ため、CI の結果に
   * 関わらず job state は遷移しない。PR が OPEN のまま再実行した場合も同様。
   */
  it("TC-019: archiveRecorded + OPEN re-run → markJobArchived / runPostMergeCleanup / getCheckStatus NOT called", async () => {
    const githubClient = makeGithubClient({
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      githubClient,
      owner: "test",
      repo: "repo",
    });

    expect(result.exitCode).toBe(0);
    // State must NOT be transitioned to archived — awaiting-archive is maintained
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    // Post-merge cleanup must NOT run — merge has not occurred
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
    // CI observation must NOT happen — plain archive is CI-agnostic
    expect(vi.mocked(githubClient.getCheckStatus)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-041: PR-less job + markJobArchived throws → exit 1 escalation
// ---------------------------------------------------------------------------

describe("plain archive — PR-less job with markJobArchived failure (TC-041)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue([
      { state: makeState({ pullRequest: undefined }), sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR },
    ]);
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
  });

  it("TC-041: PR-less + markJobArchived throws → orchestrator called / exit 1 escalation / cleanup NOT called", async () => {
    vi.mocked(markJobArchived).mockRejectedValue(new Error("disk full"));

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    // Orchestrator was called (archive record attempt)
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    // markJobArchived was called and threw
    expect(vi.mocked(markJobArchived)).toHaveBeenCalled();
    // Returns escalation
    expect(result.exitCode).toBe(1);
    expect("escalation" in result).toBe(true);
    // Cleanup not called
    expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-026: runPostMergeCleanup only called via MERGED detection branch
// ---------------------------------------------------------------------------

describe("plain archive — cleanup only via MERGED branch (TC-026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
  });

  it("TC-026: OPEN PR → cleanup never called; CLOSED PR → cleanup never called", async () => {
    for (const prState of ["OPEN", "CLOSED"] as const) {
      vi.clearAllMocks();
      vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
      vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
      vi.mocked(runPostMergeCleanup).mockResolvedValue(undefined);

      const githubClient = makeGithubClient({
        getPullRequest: vi.fn().mockResolvedValue({ state: prState }),
      });

      const result = await runPlainArchive({
        slug: FAKE_SLUG,
        cwd: FAKE_CWD,
        spawn: makeSpawn(),
        fs: makeFs(),
        githubClient,
        owner: "test",
        repo: "repo",
      });

      expect(result.exitCode).toBe(0);
      expect(vi.mocked(runPostMergeCleanup)).not.toHaveBeenCalled();
    }
  });
});
