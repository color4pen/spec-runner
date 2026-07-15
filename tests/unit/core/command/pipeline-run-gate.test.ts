/**
 * T-05: call-site 結合テスト — PipelineRunCommand.prepare() での gate 発火と bootstrapJob 非呼び出し
 *
 * - scope 宣言 fixture + canDerive=false → 着手前 reject、bootstrapJob 未呼び出し
 * - scope 宣言 fixture + canDerive=true  → 通過、bootstrapJob 呼び出し、pipelineId 記録
 * - 未知 id → getPipelineDescriptor エラーで停止、bootstrapJob 未呼び出し
 * - pipeline 未指定 → pipelineId="standard"（既定経路の回帰防止）
 * - afterEach 後に PIPELINE_REGISTRY が元の 2 本に戻っている（テスト間リークなし）
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
import { UnsupportedRuntimeCapabilityError } from "../../../../src/core/pipeline/runtime-capability-gate.js";
import type { PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import type { RuntimeStrategy, CleanupHandle, WorkspaceContext } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { PreflightResult } from "../../../../src/core/preflight.js";
import type { ParsedRequest } from "../../../../src/parser/types.js";

// ---------------------------------------------------------------------------
// Mock loadReviewerDefinitions to avoid real filesystem access
// ---------------------------------------------------------------------------

vi.mock("../../../../src/core/reviewers/load.js", () => ({
  loadReviewerDefinitions: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURE_ID = "test-fixture-scope-gate";

const FIXTURE_DESCRIPTOR: PipelineDescriptor = {
  ...STANDARD_DESCRIPTOR,
  id: FIXTURE_ID,
  permissionScope: { checkpoint: "code-review", forbidden: [] },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-gate-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Insert fixture descriptor into PIPELINE_REGISTRY before each test.
  // This allows getPipelineDescriptor(FIXTURE_ID) to resolve.
  (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[FIXTURE_ID] = FIXTURE_DESCRIPTOR;
});

afterEach(async () => {
  // Remove fixture descriptor — production registry stays at 3 entries.
  delete (PIPELINE_REGISTRY as Record<string, PipelineDescriptor>)[FIXTURE_ID];

  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Build a fake PreflightResult with the given pipeline id in request.pipeline.
 */
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

/**
 * Build a fake RuntimeStrategy with bootstrapJob as a spy.
 * canDeriveChangedFiles is set according to canDerive:
 *   true  → () => true
 *   false → () => false
 *   "absent" → property is omitted
 */
function makeFakeRuntime(
  canDerive: boolean | "absent",
): RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } {
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

  if (canDerive !== "absent") {
    runtime.canDeriveChangedFiles = () => canDerive;
  }

  return runtime;
}

/**
 * Thin subclass that exposes the protected prepare() method for testing.
 */
class TestablePipelineRunCommand extends PipelineRunCommand {
  public async testPrepare(): Promise<PrepareResult> {
    return this.prepare();
  }
}

/**
 * Build a TestablePipelineRunCommand with the given preflightResult and runtime.
 */
function makeCommand(
  preflightResult: PreflightResult,
  runtime: RuntimeStrategy,
): TestablePipelineRunCommand {
  return new TestablePipelineRunCommand(
    runtime,
    new EventBus(),
    "/fake/path/to/request.md", // non-canonical path → requestSlug = null
    preflightResult,
    { cwd: tempDir },
  );
}

// ---------------------------------------------------------------------------
// T-05-1: scope 宣言 fixture + canDerive=false → 着手前 reject、bootstrapJob 未呼び出し
// ---------------------------------------------------------------------------

describe("T-05-1: scope 宣言 fixture + canDerive=false → 着手前 reject、bootstrapJob 未呼び出し", () => {
  it("prepare() throws UnsupportedRuntimeCapabilityError", async () => {
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult(FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(
      UnsupportedRuntimeCapabilityError,
    );
  });

  it("bootstrapJob is NOT called when gate fires (job state is never created)", async () => {
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult(FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(
      UnsupportedRuntimeCapabilityError,
    );

    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });

  it("execute() propagates the UnsupportedRuntimeCapabilityError from prepare()", async () => {
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult(FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.execute()).rejects.toBeInstanceOf(
      UnsupportedRuntimeCapabilityError,
    );

    // setupWorkspace must never have been called (prepare() threw before it)
    expect(runtime.setupWorkspace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-05-2: scope 宣言 fixture + canDerive=true → 通過、bootstrapJob 呼び出し、pipelineId 記録
// ---------------------------------------------------------------------------

describe("T-05-2: scope 宣言 fixture + canDerive=true → 通過、bootstrapJob 呼び出し、pipelineId 記録", () => {
  it("prepare() succeeds when canDerive=true", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
  });

  it("bootstrapJob is called with the fixture pipelineId", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(FIXTURE_ID);
    const command = makeCommand(preflightResult, runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledTimes(1);
    expect(runtime.bootstrapJob).toHaveBeenCalledWith(
      expect.any(String), // cwd
      expect.objectContaining({ pipelineId: FIXTURE_ID }),
    );
  });
});

// ---------------------------------------------------------------------------
// T-05-3: 未知 id → getPipelineDescriptor エラーで停止、bootstrapJob 未呼び出し
// ---------------------------------------------------------------------------

describe("T-05-3: 未知 id → getPipelineDescriptor エラーで停止、bootstrapJob 未呼び出し", () => {
  it("prepare() throws when pipeline id is not registered", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult("bogus-pipeline-id-not-in-registry");
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toThrow("Unknown pipeline id");
  });

  it("bootstrapJob is NOT called for unknown pipeline id", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult("bogus-pipeline-id-not-in-registry");
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toThrow();

    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-05-4: pipeline 未指定 → pipelineId="standard"（既定経路の回帰防止）
// ---------------------------------------------------------------------------

describe("T-05-4: pipeline 未指定 → pipelineId='standard'（既定経路の回帰防止）", () => {
  it("bootstrapJob is called with pipelineId='standard' when request.pipeline is undefined", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(undefined); // pipeline absent
    const command = makeCommand(preflightResult, runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pipelineId: "standard" }),
    );
  });
});

// ---------------------------------------------------------------------------
// T-05-5: afterEach 後に PIPELINE_REGISTRY が元の 3 本に戻っている
// ---------------------------------------------------------------------------

describe("T-05-5: PIPELINE_REGISTRY がテスト間でリークしない（afterEach で delete 済み）", () => {
  it("PIPELINE_REGISTRY contains fixture inside beforeEach (setup verified)", () => {
    expect(PIPELINE_REGISTRY[FIXTURE_ID]).toBeDefined();
  });

  it("PIPELINE_REGISTRY still has standard, design-only, and fast entries", () => {
    expect(PIPELINE_REGISTRY["standard"]).toBeDefined();
    expect(PIPELINE_REGISTRY["design-only"]).toBeDefined();
    expect(PIPELINE_REGISTRY["fast"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T-06: request.pipeline="fast" + canDerive=false → 着手前 reject、bootstrapJob 未呼び出し
// ---------------------------------------------------------------------------

describe("T-06: request.pipeline='fast' + canDerive=false → UnsupportedRuntimeCapabilityError、bootstrapJob 未呼び出し", () => {
  it("prepare() throws UnsupportedRuntimeCapabilityError for fast + canDerive=false", async () => {
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult("fast");
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(
      UnsupportedRuntimeCapabilityError,
    );
  });

  it("bootstrapJob is NOT called for fast + canDerive=false (job state never created)", async () => {
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult("fast");
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).rejects.toBeInstanceOf(
      UnsupportedRuntimeCapabilityError,
    );

    expect(runtime.bootstrapJob).not.toHaveBeenCalled();
  });

  it("prepare() succeeds for fast + canDerive=true", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult("fast");
    const command = makeCommand(preflightResult, runtime);

    await expect(command.testPrepare()).resolves.toBeDefined();
  });

  it("bootstrapJob is called with pipelineId='fast' when canDerive=true", async () => {
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult("fast");
    const command = makeCommand(preflightResult, runtime);

    await command.testPrepare();

    expect(runtime.bootstrapJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pipelineId: "fast" }),
    );
  });
});
