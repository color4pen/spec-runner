/**
 * Call-site integration tests for the duplicate-slug guard wired into
 * PipelineRunCommand.prepare().
 *
 * Follows the fake runtime / TestablePipelineRunCommand pattern from
 * pipeline-run-gate.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PipelineRunCommand } from "../../../../src/core/command/pipeline-run.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, CleanupHandle, WorkspaceContext } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { PreflightResult } from "../../../../src/core/preflight.js";
import type { ParsedRequest } from "../../../../src/parser/types.js";
import { SpecRunnerError } from "../../../../src/errors.js";
import { duplicateLiveJobError } from "../../../../src/errors.js";

// ---------------------------------------------------------------------------
// Mock loadReviewerDefinitions to avoid real filesystem access
// ---------------------------------------------------------------------------

vi.mock("../../../../src/core/reviewers/load.js", () => ({
  loadReviewerDefinitions: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-dup-guard-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeFakePreflightResult(): PreflightResult {
  const request: ParsedRequest = {
    type: "new-feature",
    title: "Test Request",
    slug: "test-slug",
    baseBranch: "main",
    content: "# Test\n\n## Meta\n\n- **type**: new-feature",
    adr: false,
    pipeline: undefined,
  };

  return {
    config: { version: 1, runtime: "local", agents: {} },
    repo: { owner: "testowner", name: "testrepo" },
    request,
    githubToken: "ghp_test_token",
    githubTokenSource: "env",
  };
}

/**
 * Build a fake RuntimeStrategy with:
 * - bootstrapJob as a spy
 * - assertNoDuplicateLiveJob as a controllable function
 */
function makeFakeRuntime(
  assertNoDuplicate: (() => Promise<void>) | undefined,
): RuntimeStrategy & {
  bootstrapJob: ReturnType<typeof vi.fn>;
  assertNoDuplicateLiveJob?: ReturnType<typeof vi.fn>;
} {
  const initialState = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });

  const bootstrapJobSpy = vi.fn().mockResolvedValue(initialState);
  const assertNoDuplicateSpy = assertNoDuplicate !== undefined
    ? vi.fn().mockImplementation(assertNoDuplicate)
    : undefined;

  const runtime: RuntimeStrategy & {
    bootstrapJob: ReturnType<typeof vi.fn>;
    assertNoDuplicateLiveJob?: ReturnType<typeof vi.fn>;
  } = {
    bootstrapJob: bootstrapJobSpy,
    persistJobState: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: tempDir } as WorkspaceContext),
    buildDeps: vi.fn().mockReturnValue({}),
    registerCleanup: vi.fn().mockReturnValue({} as CleanupHandle),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
    canDeriveChangedFiles: () => true,
  };

  if (assertNoDuplicateSpy !== undefined) {
    runtime.assertNoDuplicateLiveJob = assertNoDuplicateSpy;
  }

  return runtime;
}

/**
 * Thin subclass that exposes prepare() for testing.
 */
class TestablePipelineRunCommand extends PipelineRunCommand {
  public async testPrepare(): Promise<PrepareResult> {
    return this.prepare();
  }
}

function makeCommand(
  preflightResult: PreflightResult,
  runtime: RuntimeStrategy,
): TestablePipelineRunCommand {
  return new TestablePipelineRunCommand(
    runtime,
    new EventBus(),
    "/fake/path/to/request.md",
    preflightResult,
    { cwd: tempDir },
  );
}

// ---------------------------------------------------------------------------
// TC-GUARD-01: guard throws → prepare() rejects, bootstrapJob not called
// ---------------------------------------------------------------------------

describe("TC-GUARD-01: assertNoDuplicateLiveJob throws → prepare() rejects, bootstrapJob not called", () => {
  it("prepare() rejects with DUPLICATE_LIVE_JOB", async () => {
    const runtime = makeFakeRuntime(() => {
      throw duplicateLiveJobError("test-slug", "job-A");
    });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await expect(command.testPrepare()).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === "DUPLICATE_LIVE_JOB",
    );
  });

  it("bootstrapJob is NOT called when guard fires", async () => {
    const runtime = makeFakeRuntime(() => {
      throw duplicateLiveJobError("test-slug", "job-A");
    });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(SpecRunnerError);

    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-GUARD-02: guard resolves → prepare() succeeds, bootstrapJob called once
// ---------------------------------------------------------------------------

describe("TC-GUARD-02: assertNoDuplicateLiveJob resolves → prepare() succeeds, bootstrapJob called", () => {
  it("prepare() resolves when guard passes", async () => {
    const runtime = makeFakeRuntime(async () => { /* resolve */ });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
  });

  it("bootstrapJob is called exactly once when guard passes", async () => {
    const runtime = makeFakeRuntime(async () => { /* resolve */ });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-GUARD-03: error message content validation
// ---------------------------------------------------------------------------

describe("TC-GUARD-03: error message content validation", () => {
  it("error code is DUPLICATE_LIVE_JOB", async () => {
    const runtime = makeFakeRuntime(() => {
      throw duplicateLiveJobError("test-slug", "job-A");
    });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    try {
      await command.testPrepare();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecRunnerError);
      expect((err as SpecRunnerError).code).toBe("DUPLICATE_LIVE_JOB");
    }
  });

  it("hint contains prior jobId and 'specrunner job cancel job-A'", async () => {
    const runtime = makeFakeRuntime(() => {
      throw duplicateLiveJobError("test-slug", "job-A");
    });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    try {
      await command.testPrepare();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).hint).toContain("job-A");
      expect((err as SpecRunnerError).hint).toContain("specrunner job cancel job-A");
    }
  });

  it("hint contains wait/re-running instruction", async () => {
    const runtime = makeFakeRuntime(() => {
      throw duplicateLiveJobError("test-slug", "job-A");
    });
    const command = makeCommand(makeFakePreflightResult(), runtime);

    try {
      await command.testPrepare();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).hint).toMatch(/wait|re-running/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-GUARD-04: runtime without assertNoDuplicateLiveJob → guard is silently skipped
// (optional-on-port + ?. call-site; mirrors existing pipeline-run-gate.test.ts fakes)
// ---------------------------------------------------------------------------

describe("TC-GUARD-04: fake runtime without assertNoDuplicateLiveJob → guard skipped, bootstrapJob called", () => {
  it("prepare() succeeds when assertNoDuplicateLiveJob is absent on runtime", async () => {
    // Pass undefined so the spy is NOT added to the runtime object
    const runtime = makeFakeRuntime(undefined);
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
  });

  it("bootstrapJob is called when assertNoDuplicateLiveJob is absent", async () => {
    const runtime = makeFakeRuntime(undefined);
    const command = makeCommand(makeFakePreflightResult(), runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledTimes(1);
  });
});
