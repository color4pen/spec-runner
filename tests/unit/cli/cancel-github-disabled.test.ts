/**
 * Regression test: cancel with GitHub-disabled job skips token resolution.
 *
 * T-cancel-gh-disabled: disabled + credential present + non-GitHub HTTPS origin
 * → resolveGitHubToken is NOT called, githubToken: undefined is passed to cancelSingleJob,
 *   ensuring no HTTPS extraheader injection on git push --delete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockCancelSingleJob = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ exitCode: 0, message: "Job canceled.", info: [], warnings: [] }),
);

vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    resolveId: vi.fn().mockResolvedValue("test-job-id-gh-disabled-1234"),
    list: vi.fn(),
  },
}));

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock("../../../src/core/cancel/runner.js", () => ({
  cancelSingleJob: mockCancelSingleJob,
  cancelAllTerminated: vi.fn(),
}));

vi.mock("../../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/util/spawn.js", () => ({
  spawnCommand: vi.fn(),
}));

vi.mock("../../../src/logger/pipeline-logger.js", () => ({
  initPipelineLog: vi.fn(),
  logPipelineEvent: vi.fn(),
  closePipelineLog: vi.fn(),
}));

vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, github: { enabled: false } }),
}));

vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDisabledJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `/fake/repo/specrunner/changes/test-slug/request.md`,
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    session: null,
    step: "implementer",
    status: "awaiting-resume",
    branch: "feat/test-slug",
    error: null,
    history: [],
    steps: {},
    repository: {
      origin: { url: "https://example.com/team/repo.git", digest: "abc123def456" },
    },
    githubIntegration: { enabled: false },
  } as unknown as JobState;
}

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Set fake env tokens — key assertion is that they are NOT consumed
  process.env["GH_TOKEN"] = "ghp_FAKE_SHOULD_NOT_BE_USED";
  process.env["GITHUB_TOKEN"] = "github_FAKE_SHOULD_NOT_BE_USED";
});

afterEach(() => {
  delete process.env["GH_TOKEN"];
  delete process.env["GITHUB_TOKEN"];
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// T-cancel-gh-disabled: GitHub-disabled job → resolveGitHubToken NOT called
// ---------------------------------------------------------------------------

describe("T-cancel-gh-disabled: GitHub-disabled job skips token resolution", () => {
  it("does NOT call resolveGitHubToken when job is GitHub-disabled", async () => {
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    const jobId = "test-job-id-gh-disabled-1234";
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeDisabledJobState(jobId)]);

    const { runCancel } = await import("../../../src/cli/cancel.js");
    await runCancel({
      jobId: "test-job-id-gh-disabled-1234",
      force: false,
      purge: false,
      allTerminated: false,
      yes: false,
      restoreDraft: false,
      repoRoot: "/fake/repo",
    });

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  it("passes githubToken: undefined to cancelSingleJob deps when job is GitHub-disabled", async () => {
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    const jobId = "test-job-id-gh-disabled-1234";
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeDisabledJobState(jobId)]);

    const { runCancel } = await import("../../../src/cli/cancel.js");
    await runCancel({
      jobId: "test-job-id-gh-disabled-1234",
      force: false,
      purge: false,
      allTerminated: false,
      yes: false,
      restoreDraft: false,
      repoRoot: "/fake/repo",
    });

    expect(mockCancelSingleJob).toHaveBeenCalledWith(
      expect.objectContaining({
        deps: expect.objectContaining({ githubToken: undefined }),
      }),
    );
  });

  it("resolves the contract from the archive search scope (includeArchived) — disabled job after a partial archive", async () => {
    // Scenario: the disabled job's change folder was moved to changes/archive/ by a partial
    // archive (status still awaiting-archive). It is ONLY visible with includeArchived === true;
    // a plain list() would fall back to the enabled default and resolve a token.
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    const jobId = "test-job-id-gh-disabled-1234"; // matches the hoisted resolveId mock
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (_root: string, listOpts?: { includeArchived?: boolean }) =>
        listOpts?.includeArchived === true ? [makeDisabledJobState(jobId)] : [],
    );

    const { runCancel } = await import("../../../src/cli/cancel.js");
    await runCancel({
      jobId,
      force: false,
      purge: false,
      allTerminated: false,
      yes: false,
      restoreDraft: false,
      repoRoot: "/fake/repo",
    });

    expect(JobStateStore.list).toHaveBeenCalledWith("/fake/repo", { includeArchived: true });
    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  it("GitHub-enabled job still calls resolveGitHubToken (backward compat)", async () => {
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    // Empty list → default enabled=true
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockResolveGitHubToken.mockResolvedValueOnce({ token: "ghp_test_token", source: "env" });

    const { runCancel } = await import("../../../src/cli/cancel.js");
    await runCancel({
      jobId: "test-job-id-gh-disabled-1234",
      force: false,
      purge: false,
      allTerminated: false,
      yes: false,
      restoreDraft: false,
      repoRoot: "/fake/repo",
    });

    // resolveGitHubToken IS called for GitHub-enabled jobs (default behavior)
    expect(mockResolveGitHubToken).toHaveBeenCalled();
  });
});
