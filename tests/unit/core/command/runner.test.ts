/**
 * Unit tests for CommandRunner template method.
 *
 * TC-CR-001: execute() calls prepare → setupWorkspace → buildDeps → registerCleanup → pipeline → handleResult → teardown
 * TC-CR-002: pipeline throw → outputPipelineThrowError + teardown("error") + return 1
 * TC-CR-003: prepare() throw propagates (allows subclass exit code control)
 * TC-CR-004: success path → teardown("awaiting-archive") + return 0
 * TC-CR-005: awaiting-resume path → teardown("awaiting-resume") + return 1
 * TC-06-02: pipeline success → closeVerboseLog() called (getVerboseLogFilePath() returns null)
 * TC-06-03: pipeline throw → closeVerboseLog() called (getVerboseLogFilePath() returns null)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CommandRunner } from "../../../../src/core/command/runner.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, WorkspaceContext, CleanupHandle } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import { JobStateStore } from "../../../../src/store/job-state-store.js";
import {
  setLogLevel,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "command-runner-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

function buildJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    ...overrides,
  };
}

function buildPrepareResult(overrides: Partial<PrepareResult> = {}): PrepareResult {
  return {
    jobState: buildJobState(),
    startStep: "design",
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", adr: false },
    config: {
      version: 1,
      runtime: "local",
      agents: {},
    },
    slug: "test-slug",
    logLevel: "default",
    workspaceOpts: {},
    repoRoot: "/fake/repo",
    ...overrides,
  };
}

const NOOP_HANDLE = {} as unknown as CleanupHandle;
const NOOP_WORKSPACE: WorkspaceContext = { cwd: "/worktree" };
const WORKTREE_WORKSPACE: WorkspaceContext = { cwd: "/worktree", worktreePath: "/worktree" };

function buildMockRuntime(opts: {
  finalState?: Partial<JobState>;
  pipelineThrow?: Error;
  setupThrow?: Error;
  /** When set, the mock buildDeps will include a real storeFactory pointing to this dir. */
  storeRootDir?: string;
} = {}): RuntimeStrategy {
  const finalJobState = buildJobState(opts.finalState ?? { status: "awaiting-archive", branch: "feat/test" });

  return {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockImplementation(async () => {
      if (opts.setupThrow) throw opts.setupThrow;
      return NOOP_WORKSPACE;
    }),
    buildDeps: vi.fn().mockReturnValue({
      client: undefined,
      request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", adr: false },
      slug: "test-slug",
      githubClient: {},
      cwd: "/worktree",
      runner: {
        run: opts.pipelineThrow
          ? vi.fn().mockRejectedValue(opts.pipelineThrow)
          : vi.fn().mockResolvedValue({ completionReason: "success", resultContent: null }),
      },
      storeFactory: opts.storeRootDir
        ? (id: string) => new JobStateStore(id, opts.storeRootDir!)
        : undefined,
    } as unknown as PipelineDeps),
    registerCleanup: vi.fn().mockReturnValue(NOOP_HANDLE),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    bootstrapJob: vi.fn().mockResolvedValue(buildJobState()),
    persistJobState: vi.fn().mockResolvedValue(undefined),
  };
}

// Concrete subclass for testing
class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly prepareResult: PrepareResult,
    private readonly prepareShouldThrow?: Error,
  ) {
    super(runtime, new EventBus());
  }

  protected async prepare(): Promise<PrepareResult> {
    if (this.prepareShouldThrow) throw this.prepareShouldThrow;
    return this.prepareResult;
  }
}

// Mock log-retention to prevent real filesystem ops and allow override in T-033
vi.mock("../../../../src/logger/log-retention.js", () => ({
  pruneOldLogs: vi.fn().mockResolvedValue(undefined),
}));

// Mock the pipeline to return a specific final state
vi.mock("../../../../src/core/pipeline/index.js", () => {
  const defaultState = {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
  return {
    createStandardPipeline: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue(defaultState),
    }),
    buildPipelineForJob: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue(defaultState),
    }),
  };
});

// TC-CR-001: execute() follows the template method sequence
describe("TC-CR-001: execute() calls template method steps in order", () => {
  it("calls setupWorkspace, buildDeps, registerCleanup, pipeline, teardown", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());
    const exitCode = await command.execute();

    expect(runtime.setupWorkspace).toHaveBeenCalledTimes(1);
    expect(runtime.buildDeps).toHaveBeenCalledTimes(1);
    expect(runtime.registerCleanup).toHaveBeenCalledTimes(1);
    expect(runtime.teardown).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });
});

// TC-CR-002: pipeline throw → error handling + teardown
describe("TC-CR-002: pipeline throw → outputPipelineThrowError + teardown + return 1", () => {
  it("writes error to stderr and calls teardown('error') when pipeline throws", async () => {
    const pipelineError = new Error("Pipeline crashed");
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());

    // Override pipeline mock to throw
    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(pipelineError),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    expect(runtime.teardown).toHaveBeenCalledWith(NOOP_HANDLE, "error");
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    expect(stderrCalls.some((args) => String(args[0]).includes("Pipeline crashed"))).toBe(true);
  });
});

// TC-CR-003: prepare() throw propagates
describe("TC-CR-003: prepare() throw propagates to caller", () => {
  it("throws when prepare() throws (allowing subclass exit code control)", async () => {
    const runtime = buildMockRuntime();
    const prepareError = new Error("Prepare failed");
    const command = new TestCommand(runtime, buildPrepareResult(), prepareError);

    await expect(command.execute()).rejects.toThrow("Prepare failed");
    expect(runtime.setupWorkspace).not.toHaveBeenCalled();
  });
});

// TC-CR-004: success path → teardown("awaiting-archive")
describe("TC-CR-004: success path calls teardown with awaiting-merge status", () => {
  it("calls teardown with 'awaiting-merge' and returns 0 on success", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());
    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    expect(runtime.teardown).toHaveBeenCalledWith(NOOP_HANDLE, "awaiting-archive");
  });
});

// TC-CR-005: awaiting-resume path → return 1
describe("TC-CR-005: awaiting-resume path returns 1", () => {
  it("returns 1 when pipeline returns awaiting-resume", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());

    // Override pipeline to return awaiting-resume
    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        version: 1, jobId: "test", createdAt: "", updatedAt: "",
        request: { path: "/req.md", title: "T", type: "t", slug: "s" },
        repository: { owner: "o", name: "r" },
        session: null, step: "spec-review", status: "awaiting-resume",
        branch: "feat/test", history: [],
        error: null, steps: {},
        resumePoint: { step: "spec-review", reason: "escalation", iterationsExhausted: 3 },
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    // Should have written the "resume" hint
    const combined = stderrCalls.map((c) => String(c[0])).join("");
    // logError uses stderr indirectly through stdout.write — check stdout too
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = [...stderrCalls, ...stdoutCalls].map((c) => String(c[0])).join("");
    expect(allOutput).toMatch(/resume|halted/i);
  });
});

// TC-CR-006: awaiting-merge with pullRequest.url → PR URL output before branch line
describe("TC-CR-006: awaiting-merge with pullRequest.url outputs PR URL", () => {
  it("outputs PR URL line before branch line when pullRequest.url is set", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null, step: "pr-create", status: "awaiting-archive",
        branch: "feat/test", history: [], error: null, steps: {},
        pullRequest: { url: "https://github.com/owner/repo/pull/42", number: 42 },
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = stderrCalls.map((c) => String(c[0])).join("");
    expect(allOutput).toContain("https://github.com/owner/repo/pull/42");
    expect(allOutput).toContain("PR:");
  });
});

// TC-CR-007: awaiting-merge without pullRequest → branch line only, no PR URL
describe("TC-CR-007: awaiting-merge without pullRequest outputs branch line only", () => {
  it("outputs branch line only (no PR URL) when pullRequest is undefined", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());

    // Default pipeline mock returns state without pullRequest — no need to override
    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = stderrCalls.map((c) => String(c[0])).join("");
    expect(allOutput).toContain("feat/test");
    expect(allOutput).not.toContain("PR:");
  });
});

// TC-CR-008: worktreePath from setupWorkspace is reflected in jobState passed to pipeline
describe("TC-CR-008: worktreePath from workspace is reflected in jobState passed to pipeline", () => {
  it("pipeline receives jobState with worktreePath set by setupWorkspace", async () => {
    const runtime = buildMockRuntime();
    // Override setupWorkspace to return a workspace with worktreePath
    (runtime.setupWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(WORKTREE_WORKSPACE);

    const command = new TestCommand(runtime, buildPrepareResult());

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    const pipelineRunSpy = vi.fn().mockResolvedValue({
      version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null, step: "pr-create", status: "awaiting-archive",
      branch: "feat/test", history: [], error: null, steps: {},
    });
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: pipelineRunSpy,
    });

    await command.execute();

    // Verify that pipeline.run() was called with jobState containing worktreePath
    expect(pipelineRunSpy).toHaveBeenCalledTimes(1);
    const passedJobState = pipelineRunSpy.mock.calls[0]![1];
    expect(passedJobState.worktreePath).toBe("/worktree");
  });
});

// TC-CR-009: setupWorkspace failure calls persistJobState with failed state
describe("TC-CR-009: setupWorkspace failure calls persistJobState with failed state", () => {
  it("calls persistJobState with status=failed + WORKSPACE_SETUP_FAILED when setupWorkspace throws", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const runtime = buildMockRuntime({ setupThrow: new Error("worktree failed") });
    const command = new TestCommand(runtime, buildPrepareResult({ jobState: realJobState, repoRoot: tempDir }));

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    expect(runtime.persistJobState).toHaveBeenCalledWith(
      realJobState.jobId,
      "test-slug",
      null,
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({ code: "WORKSPACE_SETUP_FAILED" }),
      }),
    );
  });
});

// TC-CR-010: pipeline throw with running state marks job as failed
describe("TC-CR-010: pipeline throw with running disk state marks job as failed", () => {
  it("persists status=failed with PIPELINE_UNHANDLED_ERROR when pipeline throws and state is still running", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const runtime = buildMockRuntime({ storeRootDir: tempDir });
    const command = new TestCommand(runtime, buildPrepareResult({ jobState: realJobState, repoRoot: tempDir }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("Pipeline crashed unexpectedly")),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);

    const store = new JobStateStore(realJobState.jobId, tempDir);
    const diskState = await store.load();
    expect(diskState.status).toBe("failed");
    expect(diskState.error?.code).toBe("PIPELINE_UNHANDLED_ERROR");
  });
});

// TC-CR-011: pipeline throw with awaiting-resume state (safety net already fired) does not overwrite
describe("TC-CR-011: pipeline throw with awaiting-resume state does not overwrite to failed", () => {
  it("leaves status=awaiting-resume unchanged when pipeline safety net already transitioned state", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const store = new JobStateStore(realJobState.jobId, tempDir);
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ jobState: realJobState }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockImplementation(async () => {
        // Simulate pipeline safety net: transition state to awaiting-resume before throwing
        await store.update(realJobState, { status: "awaiting-resume" });
        throw new Error("Unhandled pipeline error");
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);

    const diskState = await store.load();
    expect(diskState.status).toBe("awaiting-resume");
  });
});

// TC-06-02: verbose log is closed on pipeline success (no fd leak)
describe("TC-06-02: verbose log closed on pipeline success", () => {
  it("execute() success path → getVerboseLogFilePath() returns null (closeVerboseLog called)", async () => {
    setLogLevel("verbose");

    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ logLevel: "verbose" }));

    await command.execute();

    expect(getVerboseLogFilePath()).toBeNull();
  });
});

// TC-06-03: verbose log is closed on pipeline error (no fd leak)
describe("TC-06-03: verbose log closed on pipeline error", () => {
  it("execute() pipeline throw → getVerboseLogFilePath() returns null (closeVerboseLog called)", async () => {
    setLogLevel("verbose");

    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ logLevel: "verbose" }));

    // Override pipeline to throw
    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("pipeline error")),
    });

    await command.execute();

    expect(getVerboseLogFilePath()).toBeNull();
  });
});

// TC-JSON-RUN-001: json=true + awaiting-archive → stdout has JSON with result: "pr-created", exit 0
describe("TC-JSON-RUN-001: json=true + awaiting-archive → stdout JSON result pr-created, exit 0", () => {
  it("emits JSON with result pr-created to stdout and returns exit 0", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ json: true }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null, step: "pr-create", status: "awaiting-archive",
        branch: "feat/test", history: [], error: null, steps: {},
        pullRequest: { url: "https://github.com/owner/repo/pull/7", number: 7, createdAt: "" },
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(allStdout);
    expect(parsed.result).toBe("pr-created");
    expect(parsed.prUrl).toBe("https://github.com/owner/repo/pull/7");
    expect(parsed.reason).toBeNull();
    expect(parsed.schemaVersion).toBe(1);
  });
});

// TC-JSON-RUN-002: json=true + awaiting-resume → stdout has JSON with result: "awaiting-human", exit 1
describe("TC-JSON-RUN-002: json=true + awaiting-resume → stdout JSON result awaiting-human, exit 1", () => {
  it("emits JSON with result awaiting-human to stdout and returns exit 1", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ json: true }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null, step: "spec-review", status: "awaiting-resume",
        branch: "feat/test", history: [], error: null, steps: {},
        resumePoint: { step: "spec-review", reason: "escalation: needs human review", iterationsExhausted: 3 },
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(allStdout);
    expect(parsed.result).toBe("awaiting-human");
    expect(parsed.schemaVersion).toBe(1);
  });
});

// TC-JSON-RUN-003: json=true + pipeline throw (crash) → stdout has JSON with result: "failed", exit 1
describe("TC-JSON-RUN-003: json=true + pipeline crash → stdout JSON result failed, exit 1", () => {
  it("emits JSON with result failed to stdout on pipeline throw and returns exit 1", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({
      jobState: realJobState,
      repoRoot: tempDir,
      json: true,
    }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("Pipeline crashed")),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(allStdout);
    expect(parsed.result).toBe("failed");
    expect(parsed.reason.message).toBe("Pipeline crashed");
    expect(parsed.schemaVersion).toBe(1);
  });
});

// TC-JSON-RUN-004: json=false → stdout has no terminal JSON
describe("TC-JSON-RUN-004: json=false → stdout has no terminal JSON", () => {
  it("does not emit JSON to stdout when json option is false", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ json: false }));

    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    // stdout should be empty (no JSON contract output)
    expect(allStdout).toBe("");
  });
});

// TC-026: SPEC_REVIEW_RESULT_NOT_FOUND early return → stdout JSON result failed
describe("TC-026: SPEC_REVIEW_RESULT_NOT_FOUND early return with json=true emits failed JSON", () => {
  it("emits JSON with result failed for SPEC_REVIEW_RESULT_NOT_FOUND terminal", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult({ json: true }));

    const { buildPipelineForJob } = await import("../../../../src/core/pipeline/index.js");
    (buildPipelineForJob as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null, step: "spec-review", status: "failed",
        branch: "feat/test", history: [], steps: {},
        error: { code: "SPEC_REVIEW_RESULT_NOT_FOUND", message: "Result file not found", hint: "Check branch" },
      }),
    });

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(allStdout);
    expect(parsed.result).toBe("failed");
    expect(parsed.reason.code).toBe("SPEC_REVIEW_RESULT_NOT_FOUND");
    expect(parsed.schemaVersion).toBe(1);
  });
});

// TC-JSON-SETUP-001: json=true + setupWorkspace failure → stdout JSON result failed
describe("TC-JSON-SETUP-001: json=true + setupWorkspace failure → stdout JSON result failed", () => {
  it("emits JSON with result failed when setupWorkspace throws", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const runtime = buildMockRuntime({ setupThrow: new Error("worktree creation failed") });
    const command = new TestCommand(runtime, buildPrepareResult({
      jobState: realJobState,
      repoRoot: tempDir,
      json: true,
    }));

    const exitCode = await command.execute();

    expect(exitCode).toBe(1);
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    const parsed = JSON.parse(allStdout);
    expect(parsed.result).toBe("failed");
    expect(parsed.reason.code).toBe("WORKSPACE_SETUP_FAILED");
    expect(parsed.reason.message).toBe("worktree creation failed");
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.slug).toBe("string");
    expect(typeof parsed.jobId).toBe("string");
  });
});

// TC-JSON-SETUP-002: json=false + setupWorkspace failure → no stdout JSON
describe("TC-JSON-SETUP-002: json=false + setupWorkspace failure → no stdout JSON", () => {
  it("does not emit JSON to stdout on setupWorkspace failure when json=false", async () => {
    const realJobState = await JobStateStore.create(tempDir, {
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
    });

    const runtime = buildMockRuntime({ setupThrow: new Error("worktree failed") });
    const command = new TestCommand(runtime, buildPrepareResult({
      jobState: realJobState,
      repoRoot: tempDir,
      json: false,
    }));

    await command.execute();

    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStdout = stdoutCalls.map((c) => String(c[0])).join("");
    expect(allStdout).toBe("");
  });
});

// T-033: pruneOldLogs exception does not abort pipeline
describe("T-033: pruneOldLogs exception does not abort pipeline", () => {
  it("logs warning and continues pipeline when pruneOldLogs throws", async () => {
    const logRetention = await import("../../../../src/logger/log-retention.js");
    (logRetention.pruneOldLogs as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("disk full"));

    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());
    const exitCode = await command.execute();

    // Pipeline continues — exit code 0 (success)
    expect(exitCode).toBe(0);

    // logWarn writes "Warning: Failed to prune old logs: ..." to stderr
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStderr = stderrCalls.map((c) => String(c[0])).join("");
    expect(allStderr).toMatch(/Failed to prune old logs/i);
  });
});
