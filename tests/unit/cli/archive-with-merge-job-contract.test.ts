/**
 * Regression test: archive --with-merge uses job's saved contract, not current config.
 *
 * T-archive-job-contract:
 *   Config: github.enabled = false (changed after job start)
 *   Job state: no githubIntegration field (defaulting to enabled=true, or explicit enabled=true)
 *   → archive --with-merge should NOT be rejected by config check; handler uses job's contract.
 *
 * This verifies that composeGitHubIntegration is called with overrideEnabled=true
 * (the job's contract) so that token resolution proceeds correctly even when
 * the project config was changed to disabled after the job was started.
 *
 * TC-094 (inverse): config.enabled=true, job.enabled=false → --with-merge is rejected at handler.
 *   This is already verified in the archive-plain-merge-detection test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockComposeGitHubIntegration = vi.hoisted(() => vi.fn());
const mockRunMergeThenArchive = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ exitCode: 0 }),
);

vi.mock("../../../src/cli/github-composition.js", () => ({
  composeGitHubIntegration: mockComposeGitHubIntegration,
  composeGitHubIntegrationForJob: vi.fn(),
}));

vi.mock("../../../src/core/archive/merge-then-archive.js", () => ({
  runMergeThenArchive: mockRunMergeThenArchive,
}));

vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    // Config says github.enabled: false — job was started with GitHub enabled
    github: { enabled: false },
  }),
}));

vi.mock("../../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", name: "test-repo" }),
  getOriginUrl: vi.fn().mockResolvedValue("https://github.com/test-owner/test-repo.git"),
  normalizeOriginIdentity: vi.fn().mockReturnValue({
    url: "https://github.com/test-owner/test-repo.git",
    digest: "abc123",
  }),
  parseRemoteUrl: vi.fn().mockReturnValue({ owner: "test-owner", name: "test-repo" }),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/core/lifecycle/exit-guard.js", () => ({
  registerExitGuard: vi.fn(),
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockRejectedValue(new Error("not found")),
}));

vi.mock("../../../src/logger/pipeline-logger.js", () => ({
  initPipelineLog: vi.fn(),
  logPipelineEvent: vi.fn(),
  closePipelineLog: vi.fn(),
}));

vi.mock("../../../src/logger/stdout.js", () => ({
  logResult: vi.fn(),
  logError: vi.fn(),
  stderrWrite: vi.fn(),
}));

vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

vi.mock("../../../src/config/schema.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/config/schema.js")>();
  return {
    ...original,
    resolveDesignLayerConfig: vi.fn().mockReturnValue({
      enabled: false,
      command: "aozu",
      requireCitationTypes: [],
      topicEmission: false,
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-slug-job-contract";
const JOB_ID = "job-id-test-1234";
const CWD = "/tmp/test-cwd";

/** GitHub-enabled job state (no githubIntegration field = default enabled=true) */
function makeEnabledJobState(): JobState {
  return {
    version: 1,
    jobId: JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `/fake/repo/specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type: "new-feature",
      slug: SLUG,
    },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: `feat/${SLUG}`,
    error: null,
    history: [],
    steps: {},
    // GitHub-enabled: has owner/name, no githubIntegration field (= defaults to enabled)
    repository: { owner: "test-owner", name: "test-repo" },
  } as unknown as JobState;
}

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
// T-archive-job-contract: config=false, job=enabled → --with-merge uses job contract
// ---------------------------------------------------------------------------

describe("T-archive-job-contract: config=false, job=enabled — --with-merge uses job contract", () => {
  it("calls composeGitHubIntegration with overrideEnabled=true (job contract) when job is enabled", async () => {
    // Setup: GitHub-enabled job state exists
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    vi.spyOn(JobStateStore, "list").mockResolvedValue([makeEnabledJobState()]);

    // composeGitHubIntegration returns a full enabled result (simulating successful compose)
    mockComposeGitHubIntegration.mockResolvedValue({
      enabled: true,
      githubToken: "ghp_test_token",
      repository: { owner: "test-owner", name: "test-repo" },
      githubClient: {},
      tokenSource: "env",
      origin: { url: "https://github.com/test-owner/test-repo.git", digest: "abc123" },
    });

    const { runArchive } = await import("../../../src/cli/archive.js");
    await runArchive({ slug: SLUG, cwd: CWD, withMerge: true });

    // Verify composeGitHubIntegration was called with overrideEnabled=true (job contract)
    expect(mockComposeGitHubIntegration).toHaveBeenCalledWith(
      expect.anything(),
      CWD,
      expect.anything(),
      expect.objectContaining({ overrideEnabled: true }),
    );
  });

  it("proceeds to runMergeThenArchive when composeGitHubIntegration succeeds", async () => {
    const { JobStateStore } = await import("../../../src/store/job-state-store.js");
    vi.spyOn(JobStateStore, "list").mockResolvedValue([makeEnabledJobState()]);

    mockComposeGitHubIntegration.mockResolvedValue({
      enabled: true,
      githubToken: "ghp_test_token",
      repository: { owner: "test-owner", name: "test-repo" },
      githubClient: {},
      tokenSource: "env",
      origin: { url: "https://github.com/test-owner/test-repo.git", digest: "abc123" },
    });

    const { runArchive } = await import("../../../src/cli/archive.js");
    const exitCode = await runArchive({ slug: SLUG, cwd: CWD, withMerge: true });

    expect(mockRunMergeThenArchive).toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });
});
