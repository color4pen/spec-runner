/**
 * Unit tests for pipeline log initialization in src/cli/finish.ts.
 *
 * T-041: initPipelineLog is called with correct repoRoot and jobId when slug resolves
 * T-042: finish:start and finish:complete events are recorded in the pipeline log
 * T-043: finish:error event is recorded when orchestrator throws; closePipelineLog called
 * T-041b: initPipelineLog is NOT called when no slug or jobId is provided
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/core/lifecycle/exit-guard.js", () => ({
  registerExitGuard: vi.fn(),
}));

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "ghp_test", source: "env" }),
}));

vi.mock("../../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "testowner", name: "testrepo" }),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({
    title: "Test",
    type: "new-feature",
    slug: "test-slug",
    baseBranch: "main",
    content: "",
    adr: false,
  }),
}));

vi.mock("../../../src/util/spawn.js", () => ({
  spawnCommand: vi.fn(),
}));

vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    resolveId: vi.fn().mockResolvedValue("test-job-id-finish-1234"),
  },
}));

vi.mock("../../../src/core/finish/orchestrator.js", () => ({
  runFinishOrchestrator: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

vi.mock("../../../src/logger/pipeline-logger.js", () => ({
  initPipelineLog: vi.fn(),
  logPipelineEvent: vi.fn(),
  closePipelineLog: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// T-041: initPipelineLog is called with correct args when slug resolves
describe("T-041: initPipelineLog called with correct args when slug resolves", () => {
  it("calls initPipelineLog(repoRoot, resolvedJobId) before orchestrator", async () => {
    const { runFinish } = await import("../../../src/cli/finish.js");
    const { initPipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    await runFinish({ slug: "test-slug", force: false, cwd: "/repo" });

    expect(initPipelineLog).toHaveBeenCalledWith("/repo", "test-job-id-finish-1234");
  });
});

// T-042: finish:start and finish:complete events are recorded
describe("T-042: finish:start and finish:complete events recorded", () => {
  it("logs finish:start before orchestrator and finish:complete after success", async () => {
    const { runFinish } = await import("../../../src/cli/finish.js");
    const { logPipelineEvent } = await import("../../../src/logger/pipeline-logger.js");

    await runFinish({ slug: "test-slug", force: false, cwd: "/repo" });

    const eventTypes = (logPipelineEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>)["type"],
    );
    expect(eventTypes).toContain("finish:start");
    expect(eventTypes).toContain("finish:complete");
  });
});

// T-043: finish:error event recorded on orchestrator exception; closePipelineLog called
describe("T-043: finish:error event recorded on orchestrator exception", () => {
  it("logs finish:error and calls closePipelineLog when orchestrator throws", async () => {
    const { runFinishOrchestrator } = await import("../../../src/core/finish/orchestrator.js");
    (runFinishOrchestrator as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("merge failed"));

    const { runFinish } = await import("../../../src/cli/finish.js");
    const { logPipelineEvent, closePipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    await expect(runFinish({ slug: "test-slug", force: false, cwd: "/repo" })).rejects.toThrow("merge failed");

    const eventTypes = (logPipelineEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>)["type"],
    );
    expect(eventTypes).toContain("finish:error");
    expect(closePipelineLog).toHaveBeenCalled();
  });
});

// T-041b: initPipelineLog NOT called when no slug or jobId
describe("T-041b: initPipelineLog not called when no slug or jobId provided", () => {
  it("does not initialize pipeline log when slug and jobId are absent", async () => {
    const { runFinish } = await import("../../../src/cli/finish.js");
    const { initPipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    // No slug or jobId — resolvedJobIdForLog remains undefined
    await runFinish({ force: false, cwd: "/repo" });

    expect(initPipelineLog).not.toHaveBeenCalled();
  });
});
