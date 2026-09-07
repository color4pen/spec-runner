/**
 * Regression tests for ps.ts handleJobLs — GitHub credential handling.
 *
 * T-ps-gh-disabled: When all jobs are GitHub-disabled (or no awaiting-archive + PR jobs exist),
 * handleJobLs does NOT call resolveGitHubToken or createGitHubClient.
 *
 * T-ps-gh-enabled: When a GitHub-enabled awaiting-archive job with a PR exists,
 * handleJobLs resolves token and creates client for PR status check.
 *
 * These tests target handleJobLs directly (not runPs), to verify the B-19 credential
 * isolation is applied at the command handler entry point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockResolveGitHubToken = vi.hoisted(() => vi.fn().mockResolvedValue({ token: "test-token", source: "env" }));
const mockCreateGitHubClient = vi.hoisted(() => vi.fn().mockReturnValue({}));
const mockList = vi.hoisted(() => vi.fn());

vi.mock("../../../src/store/job-state-store.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/store/job-state-store.js")>();
  return {
    ...original,
    JobStateStore: class MockJobStateStore extends original.JobStateStore {
      static override list = mockList;
    },
  };
});

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: mockCreateGitHubClient,
}));

vi.mock("../../../src/cli/load-config-with-overlay.js", () => ({
  loadConfigWithOverlay: vi.fn().mockResolvedValue({ version: 1, github: {} }),
}));

vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

// Mock the worktree detection (ps.ts calls detectSpecrunnerWorktree inside runPs)
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../../src/core/job-list/operations-view.js", () => ({
  buildOperationsView: vi.fn().mockReturnValue({ categories: [] }),
  formatOperationsViewHuman: vi.fn().mockReturnValue(""),
  formatOperationsViewJson: vi.fn().mockReturnValue('{"categories":[]}'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(
  jobId: string,
  status: string,
  githubEnabled: boolean,
  hasPr: boolean,
): JobState {
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
    step: "pr-create",
    status,
    branch: "feat/test-slug",
    error: null,
    history: [],
    steps: {},
    repository: githubEnabled ? { owner: "testowner", name: "testrepo" } : {
      origin: { url: "https://example.com/team/repo.git", digest: "abc123" },
    },
    ...(githubEnabled ? {} : { githubIntegration: { enabled: false } }),
    ...(hasPr ? { pullRequest: { number: 42, url: "https://github.com/testowner/testrepo/pull/42" } } : {}),
  } as unknown as JobState;
}

const FAKE_PARSED = {
  positional: undefined,
  positionals: [],
  flags: { active: false, all: false, json: false },
};

const FAKE_CTX = {
  repoRoot: "/fake/repo",
  invokerCwd: "/fake/repo",
};

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// T-ps-gh-disabled: disabled-only jobs → no credential resolution
// ---------------------------------------------------------------------------

describe("T-ps-gh-disabled: handleJobLs with only GitHub-disabled jobs skips credential resolution", () => {
  it("does NOT call resolveGitHubToken when all jobs are GitHub-disabled", async () => {
    // One disabled awaiting-archive job with no PR
    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", false, false),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  it("does NOT call createGitHubClient when all jobs are GitHub-disabled", async () => {
    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", false, false),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockCreateGitHubClient).not.toHaveBeenCalled();
  });

  it("does NOT call resolveGitHubToken when awaiting-archive jobs are disabled even with credentials present", async () => {
    // Simulate fake GH_TOKEN in environment
    const savedGhToken = process.env["GH_TOKEN"];
    process.env["GH_TOKEN"] = "ghp_FAKE_MUST_NOT_BE_USED";

    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", false, false),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();

    if (savedGhToken !== undefined) {
      process.env["GH_TOKEN"] = savedGhToken;
    } else {
      delete process.env["GH_TOKEN"];
    }
  });

  it("does NOT call resolveGitHubToken when enabled awaiting-archive job has no PR", async () => {
    // GitHub-enabled but no pullRequest → no PR status check needed
    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", true, false),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-ps-gh-enabled: enabled job with PR → credential resolution happens
// ---------------------------------------------------------------------------

describe("T-ps-gh-enabled: handleJobLs with GitHub-enabled awaiting-archive + PR resolves token", () => {
  it("calls resolveGitHubToken when a GitHub-enabled awaiting-archive job has a PR", async () => {
    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", true, true),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockResolveGitHubToken).toHaveBeenCalled();
  });

  it("calls createGitHubClient when a GitHub-enabled awaiting-archive job has a PR", async () => {
    mockList.mockResolvedValue([
      makeJobState("job-001", "awaiting-archive", true, true),
    ]);

    const { handleJobLs } = await import("../../../src/cli/ps.js");
    await handleJobLs(FAKE_PARSED, FAKE_CTX);

    expect(mockCreateGitHubClient).toHaveBeenCalled();
  });
});
