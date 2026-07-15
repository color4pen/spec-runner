/**
 * T-08: PipelineRunCommand.prepare() — input-completeness gate integration tests.
 *
 * Verifies:
 * 1. A descriptor with an unsatisfied required read causes prepare() to throw
 *    DescriptorInputCompletenessError BEFORE bootstrapJob is called.
 * 2. A descriptor with all required reads satisfied passes through and calls bootstrapJob.
 * 3. The standard pipeline (no violations after T-01/T-02) succeeds and calls bootstrapJob.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PipelineRunCommand } from "../../../../src/core/command/pipeline-run.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import {
  PIPELINE_REGISTRY,
  STANDARD_DESCRIPTOR,
} from "../../../../src/core/pipeline/registry.js";
import {
  DescriptorInputCompletenessError,
} from "../../../../src/core/pipeline/descriptor-input-completeness.js";
import type { PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import type { RuntimeStrategy, CleanupHandle, WorkspaceContext } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { PreflightResult } from "../../../../src/core/preflight.js";
import type { ParsedRequest } from "../../../../src/parser/types.js";
import type { Step } from "../../../../src/core/step/types.js";
import { changeFolderPath, requestMdPath } from "../../../../src/util/paths.js";
import { loadReviewerDefinitions } from "../../../../src/core/reviewers/load.js";
import type { ReviewerDefinition } from "../../../../src/core/reviewers/types.js";

// ---------------------------------------------------------------------------
// Mock loadReviewerDefinitions to avoid real filesystem access
// ---------------------------------------------------------------------------

vi.mock("../../../../src/core/reviewers/load.js", () => ({
  loadReviewerDefinitions: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIOLATION_FIXTURE_ID = "test-input-completeness-violation-fixture";
const CLEAN_FIXTURE_ID = "test-input-completeness-clean-fixture";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal step with no reads or writes. */
const noopStep: Step = {
  kind: "agent",
  name: "noop",
  agent: { name: "noop", role: "noop" as never, model: "claude-sonnet-4-6", system: "", tools: [] },
  buildMessage: () => "",
  resultFilePath: () => null,
  parseResult: () => ({ verdict: null, findingsPath: null }),
  reads: () => [],
  writes: () => [],
};

/**
 * A descriptor with a step that requires a path that no producer provides.
 * This will cause the input-completeness validator to emit a violation.
 *
 * Note: The path is constructed with deps.slug in reads() so it will use
 * VALIDATOR_PROBE_SLUG at validation time, giving a deterministic path
 * that appears in the error message.
 */
function makeViolatingDescriptor(): PipelineDescriptor {
  const consumerStep: Step = {
    ...noopStep,
    name: "consumer",
    // orphan-file-that-nobody-writes.md is not produced by any upstream step
    reads: (_state, deps) => [
      { path: `${changeFolderPath(deps.slug)}/orphan-file-that-nobody-writes.md` },
    ],
    writes: () => [],
  };

  return {
    ...STANDARD_DESCRIPTOR,
    id: VIOLATION_FIXTURE_ID,
    steps: [["consumer", consumerStep]],
    // No permissionScope → canDeriveChangedFiles gate does not fire
    permissionScope: undefined,
  };
}

/**
 * A descriptor where the single step reads only ambient inputs (request.md).
 * This passes the input-completeness validator.
 *
 * Note: deps.slug in reads() will equal VALIDATOR_PROBE_SLUG because the validator
 * uses its internal probe deps. The ambient path passed to validateDescriptorInputCompleteness
 * must also use VALIDATOR_PROBE_SLUG (done in pipeline-run.ts).
 */
function makeCleanDescriptor(): PipelineDescriptor {
  const cleanStep: Step = {
    ...noopStep,
    name: "clean-step",
    // Reads request.md using deps.slug — will be VALIDATOR_PROBE_SLUG at validation time.
    reads: (_state, deps) => [{ path: requestMdPath(deps.slug) }],
    writes: () => [],
  };

  return {
    ...STANDARD_DESCRIPTOR,
    id: CLEAN_FIXTURE_ID,
    steps: [["clean-step", cleanStep]],
    permissionScope: undefined,
  };
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-input-completeness-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Register fixtures in PIPELINE_REGISTRY before each test.
  (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[VIOLATION_FIXTURE_ID] = makeViolatingDescriptor();
  (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[CLEAN_FIXTURE_ID] = makeCleanDescriptor();
});

afterEach(async () => {
  // Clean up registry to avoid cross-test pollution.
  delete (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[VIOLATION_FIXTURE_ID];
  delete (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[CLEAN_FIXTURE_ID];

  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Runtime + command helpers
// ---------------------------------------------------------------------------

function makeFakeRuntime(): RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } {
  const initialState = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });

  const bootstrapJobSpy = vi.fn().mockResolvedValue(initialState);

  const runtime: RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } = {
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
  };

  return runtime;
}

function makeFakePreflightResult(pipelineId?: string): PreflightResult {
  const request: ParsedRequest = {
    type: "new-feature",
    title: "Test Request",
    slug: "test-slug",
    baseBranch: "main",
    content: "# Test\n\n## Meta\n\n- **type**: new-feature",
    adr: false,
    pipeline: pipelineId,
  };

  return {
    config: { version: 1, runtime: "local", agents: {} },
    repo: { owner: "testowner", name: "testrepo" },
    request,
    githubToken: "ghp_test_token",
    githubTokenSource: "env",
  };
}

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
// T-08-1: Violating descriptor → DescriptorInputCompletenessError, bootstrapJob NOT called
// ---------------------------------------------------------------------------

describe("T-08-1: violation fixture → DescriptorInputCompletenessError before bootstrapJob", () => {
  it("prepare() throws DescriptorInputCompletenessError for the violating descriptor", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(VIOLATION_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(DescriptorInputCompletenessError);
  });

  it("bootstrapJob is NOT called when the violation gate fires", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(VIOLATION_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(DescriptorInputCompletenessError);

    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });

  it("error message includes the step name and missing path", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(VIOLATION_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    let caughtError: unknown;
    try {
      await command.testPrepare();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(DescriptorInputCompletenessError);
    const e = caughtError as DescriptorInputCompletenessError;
    expect(e.message).toMatch(/consumer/);
    expect(e.message).toMatch(/orphan-file-that-nobody-writes/);
    expect(e.violations).toHaveLength(1);
    expect(e.violations[0]?.step).toBe("consumer");
  });

  it("execute() propagates DescriptorInputCompletenessError from prepare()", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(VIOLATION_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.execute()).rejects.toBeInstanceOf(DescriptorInputCompletenessError);
    expect(runtime.setupWorkspace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-08-2: Clean descriptor → bootstrapJob IS called
// ---------------------------------------------------------------------------

describe("T-08-2: clean descriptor → no violation, bootstrapJob is called", () => {
  it("prepare() succeeds for the clean descriptor", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(CLEAN_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
  });

  it("bootstrapJob IS called for the clean descriptor", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(CLEAN_FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// T-08-3: Standard pipeline passes without violation (regression guard)
// ---------------------------------------------------------------------------

describe("T-08-3: standard pipeline passes the input-completeness gate (regression)", () => {
  it("prepare() with pipelineId='standard' succeeds (no violations)", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(undefined); // standard (default)
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
    expect(runtime.bootstrapJob).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-009 / T-08-4: Custom reviewer composition path — required read violation
//
// Exercises the path where loadReviewerDefinitions returns a non-empty reviewer,
// composeReviewerDescriptor inserts a custom reviewer step (which reads design.md
// and tasks.md as required), and those reads are unsatisfied by the base descriptor.
// Verifies DescriptorInputCompletenessError is thrown from prepare() BEFORE bootstrapJob.
// ---------------------------------------------------------------------------

describe("TC-009 / T-08-4: custom reviewer composition — required read violation detected in composed descriptor", () => {
  /**
   * A minimal base pipeline with no step that produces design.md or tasks.md.
   * When composeReviewerDescriptor appends a custom reviewer (which reads design.md
   * and tasks.md as required), those required reads go unsatisfied → violation.
   */
  const TC009_BASE_PIPELINE_ID = "test-tc009-custom-reviewer-no-producer";

  /** Minimal fake reviewer definition that passes validateReviewerDefinitions. */
  const fakeReviewerDef: ReviewerDefinition = {
    name: "tc009-fake",
    filename: "tc009-fake.md",
    maxIterations: 3,
    purpose: "TC-009 integration test fixture",
    criteria: "Test criteria",
    judgment: "Test judgment",
    freeText: "",
  };

  beforeEach(() => {
    // Register a minimal base descriptor with no producer for design.md / tasks.md.
    // The noop step writes nothing, so the custom reviewer's required reads are unsatisfied.
    (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[TC009_BASE_PIPELINE_ID] = {
      ...STANDARD_DESCRIPTOR,
      id: TC009_BASE_PIPELINE_ID,
      steps: [["tc009-noop", { ...noopStep, name: "tc009-noop" }]],
      permissionScope: undefined,
    };
  });

  afterEach(() => {
    delete (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[TC009_BASE_PIPELINE_ID];
  });

  it("prepare() throws DescriptorInputCompletenessError when composed descriptor has unsatisfied required read from custom reviewer", async () => {
    // Override the global mock for this test: return a valid reviewer definition.
    // composeReviewerDescriptor will insert a custom reviewer step (reads design.md + tasks.md)
    // into the no-producer base descriptor → unsatisfied required reads → violation.
    vi.mocked(loadReviewerDefinitions).mockResolvedValueOnce([fakeReviewerDef]);

    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(TC009_BASE_PIPELINE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(DescriptorInputCompletenessError);
  });

  it("bootstrapJob is NOT called when custom reviewer composition triggers violation gate", async () => {
    vi.mocked(loadReviewerDefinitions).mockResolvedValueOnce([fakeReviewerDef]);

    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(TC009_BASE_PIPELINE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(DescriptorInputCompletenessError);
    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });

  it("error violations include the custom reviewer step name and an unsatisfied file path", async () => {
    vi.mocked(loadReviewerDefinitions).mockResolvedValueOnce([fakeReviewerDef]);

    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult(TC009_BASE_PIPELINE_ID);
    const command = makeCommand(preflightResult, runtime);

    let caughtError: unknown;
    try {
      await command.testPrepare();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(DescriptorInputCompletenessError);
    const e = caughtError as DescriptorInputCompletenessError;

    // The custom reviewer step name ("tc009-fake") must appear in violations
    expect(e.violations.some((v) => v.step === "tc009-fake")).toBe(true);
    // The unsatisfied required read is design.md or tasks.md (custom reviewer's required reads)
    expect(
      e.violations.some((v) => v.path.includes("design.md") || v.path.includes("tasks.md")),
    ).toBe(true);
  });
});
