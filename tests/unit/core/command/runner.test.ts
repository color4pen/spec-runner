/**
 * Unit tests for CommandRunner template method.
 *
 * TC-CR-001: execute() calls prepare → setupWorkspace → buildDeps → registerCleanup → pipeline → handleResult → teardown
 * TC-CR-002: pipeline throw → outputPipelineThrowError + teardown("error") + return 1
 * TC-CR-003: prepare() throw propagates (allows subclass exit code control)
 * TC-CR-004: success path → teardown("awaiting-merge") + return 0
 * TC-CR-005: awaiting-resume path → teardown("awaiting-resume") + return 1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CommandRunner } from "../../../../src/core/command/runner.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, WorkspaceContext, CleanupHandle } from "../../../../src/core/runtime/strategy.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "command-runner-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
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
    step: "propose",
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
    startStep: "propose",
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", enabled: [] },
    config: {
      version: 1,
      runtime: "local",
      anthropic: { apiKey: "" },
      agents: {},
    },
    repo: { owner: "testowner", name: "testrepo" },
    slug: "test-slug",
    verbose: false,
    workspaceOpts: {},
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
} = {}): RuntimeStrategy {
  const finalJobState = buildJobState(opts.finalState ?? { status: "awaiting-merge", branch: "feat/test" });

  return {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockImplementation(async () => {
      if (opts.setupThrow) throw opts.setupThrow;
      return NOOP_WORKSPACE;
    }),
    buildDeps: vi.fn().mockReturnValue({
      client: undefined,
      config: { version: 1, anthropic: { apiKey: "" }, agents: {} },
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", enabled: [] },
      slug: "test-slug",
      githubClient: {},
      cwd: "/worktree",
      runner: {
        run: opts.pipelineThrow
          ? vi.fn().mockRejectedValue(opts.pipelineThrow)
          : vi.fn().mockResolvedValue({ completionReason: "success", resultContent: null }),
      },
    } as unknown as PipelineDeps),
    registerCleanup: vi.fn().mockReturnValue(NOOP_HANDLE),
    teardown: vi.fn().mockResolvedValue(undefined),
  };
}

// Concrete subclass for testing
class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly prepareResult: PrepareResult,
    private readonly prepareShouldThrow?: Error,
  ) {
    super(runtime);
  }

  protected async prepare(): Promise<PrepareResult> {
    if (this.prepareShouldThrow) throw this.prepareShouldThrow;
    return this.prepareResult;
  }
}

// Mock the pipeline to return a specific final state
vi.mock("../../../../src/core/pipeline/index.js", () => ({
  createStandardPipeline: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue(
      // Default: awaiting-merge success state
      {
        version: 1,
        jobId: "test-job-id",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
        repository: { owner: "testowner", name: "testrepo" },
        session: null,
        step: "pr-create",
        status: "awaiting-merge",
        branch: "feat/test",
        history: [],
        error: null,
        steps: {},
      }
    ),
  }),
}));

vi.mock("../../../../src/cli/progress.js", () => ({
  ProgressDisplay: vi.fn(),
}));

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
    const { createStandardPipeline } = await import("../../../../src/core/pipeline/index.js");
    (createStandardPipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
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

// TC-CR-004: success path → teardown("awaiting-merge")
describe("TC-CR-004: success path calls teardown with awaiting-merge status", () => {
  it("calls teardown with 'awaiting-merge' and returns 0 on success", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());
    const exitCode = await command.execute();

    expect(exitCode).toBe(0);
    expect(runtime.teardown).toHaveBeenCalledWith(NOOP_HANDLE, "awaiting-merge");
  });
});

// TC-CR-005: awaiting-resume path → return 1
describe("TC-CR-005: awaiting-resume path returns 1", () => {
  it("returns 1 when pipeline returns awaiting-resume", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(runtime, buildPrepareResult());

    // Override pipeline to return awaiting-resume
    const { createStandardPipeline } = await import("../../../../src/core/pipeline/index.js");
    (createStandardPipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
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

// TC-CR-006: worktreePath from setupWorkspace is reflected in jobState passed to pipeline
describe("TC-CR-006: worktreePath from workspace is reflected in jobState passed to pipeline", () => {
  it("pipeline receives jobState with worktreePath set by setupWorkspace", async () => {
    const runtime = buildMockRuntime();
    // Override setupWorkspace to return a workspace with worktreePath
    (runtime.setupWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(WORKTREE_WORKSPACE);

    const command = new TestCommand(runtime, buildPrepareResult());

    const { createStandardPipeline } = await import("../../../../src/core/pipeline/index.js");
    const pipelineRunSpy = vi.fn().mockResolvedValue({
      version: 1, jobId: "test-job-id", createdAt: "", updatedAt: "",
      request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null, step: "pr-create", status: "awaiting-merge",
      branch: "feat/test", history: [], error: null, steps: {},
    });
    (createStandardPipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      run: pipelineRunSpy,
    });

    await command.execute();

    // Verify that pipeline.run() was called with jobState containing worktreePath
    expect(pipelineRunSpy).toHaveBeenCalledTimes(1);
    const passedJobState = pipelineRunSpy.mock.calls[0]![1];
    expect(passedJobState.worktreePath).toBe("/worktree");
  });
});
