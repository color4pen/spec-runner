/**
 * Unit tests for runReopenCore — GitHub-disabled job path.
 *
 * TC-063: GitHub-disabled job reopen does NOT resolve GitHub token and makes 0 API calls
 *   (spec.md > GitHub無効jobのreopenはPR_gateを要求しない > T-08 AC)
 * TC-060: GitHub-disabled job reopen skips PR gate (githubClient: null)
 *   (spec.md > GitHub無効jobのreopenはPR_gateを要求しない > PRなしでreopenできる)
 *
 * These tests cover the new code paths added in src/cli/reopen.ts:
 *   - Reading jobGithubEnabled from stored state (lines 44-57)
 *   - Skipping composeGitHubIntegrationForJob for disabled jobs (lines 59-75)
 *
 * Mock boundary:
 *   - JobStateStore.list — returns test job state fixtures
 *   - loadConfigWithOverlay — spy to assert it is NOT called for disabled jobs
 *   - composeGitHubIntegrationForJob — spy to assert it is NOT called for disabled jobs
 *   - ReopenCommand — captures the githubClient argument passed to constructor
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const mockList = vi.hoisted(() => vi.fn());
const mockLoadConfigWithOverlay = vi.hoisted(() => vi.fn());
const mockComposeGitHubIntegrationForJob = vi.hoisted(() => vi.fn());
let capturedGithubClient: unknown = "not-called";
const mockReopenCommandExecute = vi.hoisted(() => vi.fn().mockResolvedValue(0));

vi.mock("../../../src/store/job-state-store.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/store/job-state-store.js")>();
  return {
    ...original,
    JobStateStore: class MockJobStateStore extends original.JobStateStore {
      static override list = mockList;
    },
  };
});

vi.mock("../../../src/cli/load-config-with-overlay.js", () => ({
  loadConfigWithOverlay: mockLoadConfigWithOverlay,
}));

vi.mock("../../../src/cli/github-composition.js", () => ({
  composeGitHubIntegrationForJob: mockComposeGitHubIntegrationForJob,
  composeGitHubIntegration: vi.fn(),
}));

vi.mock("../../../src/core/command/reopen.js", () => ({
  ReopenCommand: class MockReopenCommand {
    constructor(_slug: string, opts: { githubClient: unknown }) {
      capturedGithubClient = opts.githubClient;
    }
    execute = mockReopenCommandExecute;
  },
}));

vi.mock("../../../src/logger/stdout.js", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  stderrWrite: vi.fn(),
  stdoutWrite: vi.fn(),
  setLogLevel: vi.fn(),
  initVerboseLog: vi.fn(),
  closeVerboseLog: vi.fn(),
  getVerboseLogFilePath: vi.fn().mockReturnValue(null),
  isLevelEnabled: vi.fn().mockReturnValue(false),
  resolveLogLevel: vi.fn().mockReturnValue("default"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-slug";
const FAKE_CWD = "/fake/repo";

function makeJobState(
  slug: string,
  githubEnabled: boolean,
): JobState {
  const base: JobState = {
    version: 1,
    jobId: `job-${slug.slice(0, 8)}-00001`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `/fake/repo/specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: `feat/${slug}`,
    error: null,
    history: [],
    steps: {},
    repository: githubEnabled ? { owner: "testowner", name: "testrepo" } : {},
  } as JobState;

  if (!githubEnabled) {
    (base as Record<string, unknown>).githubIntegration = { enabled: false };
  }

  return base;
}

beforeEach(() => {
  capturedGithubClient = "not-called";
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  mockReopenCommandExecute.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-063: GitHub-disabled job — token NOT resolved, API NOT called
// ---------------------------------------------------------------------------

describe("TC-063: GitHub-disabled job reopen does not resolve token or call GitHub API", () => {
  it("does not call loadConfigWithOverlay when job is GitHub-disabled", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "fix it", cwd: FAKE_CWD });

    expect(mockLoadConfigWithOverlay).not.toHaveBeenCalled();
  });

  it("does not call composeGitHubIntegrationForJob when job is GitHub-disabled", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "fix it", cwd: FAKE_CWD });

    expect(mockComposeGitHubIntegrationForJob).not.toHaveBeenCalled();
  });

  it("passes githubClient: null to ReopenCommand when job is GitHub-disabled", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "fix it", cwd: FAKE_CWD });

    expect(capturedGithubClient).toBeNull();
  });

  it("returns exit code from ReopenCommand.execute()", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);
    mockReopenCommandExecute.mockResolvedValue(0);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    const code = await runReopenCore(SLUG, { reason: "fix it", cwd: FAKE_CWD });

    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-060: GitHub-disabled job reopen skips PR gate
// ---------------------------------------------------------------------------

describe("TC-060: GitHub-disabled job reopen skips PR gate (githubClient null)", () => {
  it("reads job state to determine github integration status", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "manual fix needed", cwd: FAKE_CWD });

    // JobStateStore.list is called with the cwd
    expect(mockList).toHaveBeenCalledWith(FAKE_CWD);
  });

  it("with no matching job state, defaults to github-enabled (backward compat)", async () => {
    // No matching job — list returns empty
    mockList.mockResolvedValue([]);
    // Config load fails → client stays null (no token)
    mockLoadConfigWithOverlay.mockRejectedValue(new Error("No config"));

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "fix", cwd: FAKE_CWD });

    // loadConfigWithOverlay IS attempted (default enabled=true)
    // but since it throws, githubClient stays null (outer catch swallows)
    expect(mockLoadConfigWithOverlay).toHaveBeenCalled();
    expect(capturedGithubClient).toBeNull();
  });

  it("with list throwing, defaults to github-enabled path", async () => {
    // list throws — inner catch applies, jobGithubEnabled stays true
    mockList.mockRejectedValue(new Error("disk error"));
    mockLoadConfigWithOverlay.mockRejectedValue(new Error("No config"));

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    // Should not throw — outer catch handles it
    await runReopenCore(SLUG, { reason: "fix", cwd: FAKE_CWD });

    // config IS attempted (default enabled=true path)
    expect(mockLoadConfigWithOverlay).toHaveBeenCalled();
  });

  it("repoRoot is preferred over cwd for reading job state", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, false)]);

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, {
      reason: "fix",
      cwd: "/invoker/cwd",
      repoRoot: "/repo/root",
    });

    // list should be called with repoRoot, not cwd
    expect(mockList).toHaveBeenCalledWith("/repo/root");
    expect(mockLoadConfigWithOverlay).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-131 (regression guard): GitHub-enabled job still resolves token
// ---------------------------------------------------------------------------

describe("TC-131 (regression): GitHub-enabled job still attempts token resolution", () => {
  it("calls loadConfigWithOverlay for a GitHub-enabled job", async () => {
    mockList.mockResolvedValue([makeJobState(SLUG, true)]);
    // Config loads successfully
    mockLoadConfigWithOverlay.mockResolvedValue({ github: {}, runtime: "local" });
    // Integration compose succeeds but returns null client (no token)
    mockComposeGitHubIntegrationForJob.mockResolvedValue({ githubClient: null });

    const { runReopenCore } = await import("../../../src/cli/reopen.js");
    await runReopenCore(SLUG, { reason: "needs fix", cwd: FAKE_CWD });

    expect(mockLoadConfigWithOverlay).toHaveBeenCalled();
    expect(mockComposeGitHubIntegrationForJob).toHaveBeenCalled();
  });
});
