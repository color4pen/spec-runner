/**
 * Unit tests for pipeline log initialization in src/cli/cancel.ts.
 *
 * T-044: initPipelineLog is called with correct repoRoot and resolvedJobId for single job cancel
 * T-044b: cancel:start and cancel:complete events are recorded
 * T-044c: cancel:error event is recorded when cancelSingleJob throws; closePipelineLog called
 * T-045: --all-terminated does NOT call initPipelineLog (bulk cancel)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    resolveId: vi.fn().mockResolvedValue("test-job-id-cancel-5678"),
  },
}));

vi.mock("../../../src/core/cancel/runner.js", () => ({
  cancelSingleJob: vi.fn().mockResolvedValue({
    exitCode: 0,
    message: "Job canceled.",
    info: [],
    warnings: [],
  }),
  cancelAllTerminated: vi.fn().mockResolvedValue({
    exitCode: 0,
    message: "All terminated jobs canceled.",
    info: [],
    warnings: [],
  }),
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

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// T-044: initPipelineLog called with correct args for single job cancel
describe("T-044: initPipelineLog called with correct args for single job cancel", () => {
  it("calls initPipelineLog(repoRoot, resolvedJobId) before cancel", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { initPipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    await runCancel({ jobId: "test-job", force: false, purge: false, allTerminated: false, yes: false, restoreDraft: false, repoRoot: "/repo" });

    expect(initPipelineLog).toHaveBeenCalledWith("/repo", "test-job-id-cancel-5678");
  });
});

// T-044b: cancel:start and cancel:complete events are recorded
describe("T-044b: cancel:start and cancel:complete events recorded", () => {
  it("logs cancel:start before cancel and cancel:complete after success", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { logPipelineEvent } = await import("../../../src/logger/pipeline-logger.js");

    await runCancel({ jobId: "test-job", force: false, purge: false, allTerminated: false, yes: false, restoreDraft: false, repoRoot: "/repo" });

    const eventTypes = (logPipelineEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>)["type"],
    );
    expect(eventTypes).toContain("cancel:start");
    expect(eventTypes).toContain("cancel:complete");
  });
});

// T-044c: cancel:error event recorded on cancelSingleJob exception; closePipelineLog called
describe("T-044c: cancel:error event recorded on cancelSingleJob exception", () => {
  it("logs cancel:error and calls closePipelineLog when cancelSingleJob throws", async () => {
    const cancelRunner = await import("../../../src/core/cancel/runner.js");
    (cancelRunner.cancelSingleJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("cancel failed"));

    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { logPipelineEvent, closePipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    await expect(
      runCancel({ jobId: "test-job", force: false, purge: false, allTerminated: false, yes: false, restoreDraft: false, repoRoot: "/repo" }),
    ).rejects.toThrow("cancel failed");

    const eventTypes = (logPipelineEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>)["type"],
    );
    expect(eventTypes).toContain("cancel:error");
    expect(closePipelineLog).toHaveBeenCalled();
  });
});

// T-045: --all-terminated does NOT call initPipelineLog
describe("T-045: --all-terminated does not call initPipelineLog", () => {
  it("does not initialize individual job pipeline log for bulk cancellation", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { initPipelineLog } = await import("../../../src/logger/pipeline-logger.js");

    await runCancel({ force: false, purge: false, allTerminated: true, yes: true, restoreDraft: false, repoRoot: "/repo" });

    expect(initPipelineLog).not.toHaveBeenCalled();
  });
});

// T-046: --all-terminated --restore-draft exits 2 without calling runner
describe("T-046: --all-terminated --restore-draft exits 2", () => {
  it("returns exit 2 when --restore-draft and --all-terminated are combined", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { cancelSingleJob, cancelAllTerminated } = await import("../../../src/core/cancel/runner.js");

    const exitCode = await runCancel({
      force: false, purge: false, allTerminated: true, yes: false, restoreDraft: true, repoRoot: "/repo",
    });

    expect(exitCode).toBe(2);
    expect(cancelSingleJob).not.toHaveBeenCalled();
    expect(cancelAllTerminated).not.toHaveBeenCalled();
  });
});

// T-047: restoreDraft forwarded to cancelSingleJob
describe("T-047: restoreDraft forwarded to cancelSingleJob", () => {
  it("passes restoreDraft: true to cancelSingleJob when --restore-draft is set", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { cancelSingleJob } = await import("../../../src/core/cancel/runner.js");

    await runCancel({ jobId: "test-job", force: false, purge: false, allTerminated: false, yes: false, restoreDraft: true, repoRoot: "/repo" });

    expect(cancelSingleJob).toHaveBeenCalledWith(expect.objectContaining({
      restoreDraft: true,
    }));
  });

  it("passes restoreDraft: false to cancelSingleJob when omitted", async () => {
    const { runCancel } = await import("../../../src/cli/cancel.js");
    const { cancelSingleJob } = await import("../../../src/core/cancel/runner.js");

    await runCancel({ jobId: "test-job", force: false, purge: false, allTerminated: false, yes: false, restoreDraft: false, repoRoot: "/repo" });

    expect(cancelSingleJob).toHaveBeenCalledWith(expect.objectContaining({
      restoreDraft: false,
    }));
  });
});
