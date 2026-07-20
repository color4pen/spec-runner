/**
 * Unit tests for src/cli/inbox.ts — runInboxRun.
 *
 * Verifies that runInboxRun uses the dispatch-resolved repoRoot from options
 * and does not re-resolve the repo root internally.
 *
 * TC-INX-001: loadConfigWithOverlay is called with pre-resolved repoRoot (no redundant git call)
 * TC-INX-002: getOriginInfo is called with repoRoot from options
 * TC-INX-003: runInboxRun returns 0 on success
 * TC-INX-004: runInboxRun returns EXIT_CODE.GENERAL_ERROR when loadConfigWithOverlay throws
 * TC-INX-005: runInboxRun returns EXIT_CODE.GENERAL_ERROR when resolveGitHubToken throws
 * TC-INX-006: runInboxRun returns EXIT_CODE.GENERAL_ERROR when getOriginInfo throws
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/cli/load-config-with-overlay.js", () => ({
  loadConfigWithOverlay: vi.fn(),
}));

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn(),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

vi.mock("../../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn(),
}));

vi.mock("../../../src/config/schema.js", () => ({
  resolveInboxConfig: vi.fn().mockReturnValue({
    approveLabel: "approved",
    maxStartsPerRun: 5,
  }),
}));

vi.mock("../../../src/core/inbox/run-inbox.js", () => ({
  runInboxOrchestrator: vi.fn(),
}));

vi.mock("../../../src/logger/stdout.js", () => ({
  logError: vi.fn(),
  stderrWrite: vi.fn(),
}));

const mockConfig = {
  version: 1,
  runtime: "local",
  agents: {},
  pipeline: { maxRetries: 2 },
  github: {},
};

const mockSummary = {
  started: [],
  rejected: [],
  resumed: [],
  recovered: [],
  escalated: [],
  errors: [],
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

describe("TC-INX-001: loadConfigWithOverlay is called with pre-resolved repoRoot", () => {
  it("passes (repoRoot, repoRoot) to loadConfigWithOverlay — no redundant git resolution", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const { getOriginInfo } = await import("../../../src/git/remote.js");
    const { runInboxOrchestrator } = await import("../../../src/core/inbox/run-inbox.js");

    vi.mocked(loadConfigWithOverlay).mockResolvedValue(mockConfig as never);
    vi.mocked(resolveGitHubToken).mockResolvedValue({ token: "ghp_test" } as never);
    vi.mocked(getOriginInfo).mockResolvedValue({ owner: "org", name: "repo" } as never);
    vi.mocked(runInboxOrchestrator).mockResolvedValue(mockSummary as never);

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(loadConfigWithOverlay).toHaveBeenCalledWith("/projects/myrepo", "/projects/myrepo");
  });
});

describe("TC-INX-002: getOriginInfo is called with repoRoot from options", () => {
  it("passes repoRoot to getOriginInfo", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const { getOriginInfo } = await import("../../../src/git/remote.js");
    const { runInboxOrchestrator } = await import("../../../src/core/inbox/run-inbox.js");

    vi.mocked(loadConfigWithOverlay).mockResolvedValue(mockConfig as never);
    vi.mocked(resolveGitHubToken).mockResolvedValue({ token: "ghp_test" } as never);
    vi.mocked(getOriginInfo).mockResolvedValue({ owner: "org", name: "repo" } as never);
    vi.mocked(runInboxOrchestrator).mockResolvedValue(mockSummary as never);

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(getOriginInfo).toHaveBeenCalledWith("/projects/myrepo", "github.com");
  });
});

describe("TC-INX-003: runInboxRun returns 0 on success", () => {
  it("returns 0 when all dependencies succeed", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const { getOriginInfo } = await import("../../../src/git/remote.js");
    const { runInboxOrchestrator } = await import("../../../src/core/inbox/run-inbox.js");

    vi.mocked(loadConfigWithOverlay).mockResolvedValue(mockConfig as never);
    vi.mocked(resolveGitHubToken).mockResolvedValue({ token: "ghp_test" } as never);
    vi.mocked(getOriginInfo).mockResolvedValue({ owner: "org", name: "repo" } as never);
    vi.mocked(runInboxOrchestrator).mockResolvedValue(mockSummary as never);

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    const code = await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(code).toBe(0);
  });
});

describe("TC-INX-004: runInboxRun returns GENERAL_ERROR when loadConfigWithOverlay throws", () => {
  it("returns non-zero exit code when config load fails", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");

    vi.mocked(loadConfigWithOverlay).mockRejectedValue(new Error("config not found"));

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    const code = await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(code).toBeGreaterThan(0);
  });
});

describe("TC-INX-005: runInboxRun returns GENERAL_ERROR when resolveGitHubToken throws", () => {
  it("returns non-zero exit code when token resolution fails", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");

    vi.mocked(loadConfigWithOverlay).mockResolvedValue(mockConfig as never);
    vi.mocked(resolveGitHubToken).mockRejectedValue(new Error("no token"));

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    const code = await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(code).toBeGreaterThan(0);
  });
});

describe("TC-INX-006: runInboxRun returns GENERAL_ERROR when getOriginInfo throws", () => {
  it("returns non-zero exit code when git remote resolution fails", async () => {
    const { loadConfigWithOverlay } = await import("../../../src/cli/load-config-with-overlay.js");
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const { getOriginInfo } = await import("../../../src/git/remote.js");

    vi.mocked(loadConfigWithOverlay).mockResolvedValue(mockConfig as never);
    vi.mocked(resolveGitHubToken).mockResolvedValue({ token: "ghp_test" } as never);
    vi.mocked(getOriginInfo).mockRejectedValue(new Error("no remote"));

    const { runInboxRun } = await import("../../../src/cli/inbox.js");
    const code = await runInboxRun({ repoRoot: "/projects/myrepo" });

    expect(code).toBeGreaterThan(0);
  });
});
