/**
 * TC-010: pipeline-run prepare() が designLayerEnabled を workspaceOpts に詰める
 *
 * Verifies that PipelineRunCommand.prepare() passes resolveDesignLayerConfig(config).enabled
 * to workspaceOpts.designLayerEnabled correctly.
 *
 * Test cases:
 * - TC-010-a: designLayer.enabled: true  → workspaceOpts.designLayerEnabled === true
 * - TC-010-b: designLayer.enabled: false → workspaceOpts.designLayerEnabled === false
 * - TC-010-c: designLayer absent        → workspaceOpts.designLayerEnabled === false
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
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-pipeline-run-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeFakePreflightResult(config: SpecRunnerConfig): PreflightResult {
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
    config,
    repo: { owner: "testowner", name: "testrepo" },
    request,
    githubToken: "ghp_test_token",
    githubTokenSource: "env",
  };
}

function makeFakeRuntime(): RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } {
  const initialState = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });

  return {
    bootstrapJob: vi.fn().mockResolvedValue(initialState),
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
    listChangedFiles: vi.fn().mockResolvedValue([]),
    canDeriveChangedFiles: () => true,
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
// TC-010-a: designLayer.enabled: true → workspaceOpts.designLayerEnabled === true
// ---------------------------------------------------------------------------

describe("TC-010-a: designLayer.enabled: true → workspaceOpts.designLayerEnabled is true", () => {
  it("prepare() sets workspaceOpts.designLayerEnabled to true when designLayer.enabled is true", async () => {
    const config: SpecRunnerConfig = {
      version: 1,
      runtime: "local",
      agents: {},
      designLayer: { enabled: true },
    };
    const runtime = makeFakeRuntime();
    const command = makeCommand(makeFakePreflightResult(config), runtime);

    const result = await command.testPrepare();

    expect(result.workspaceOpts.designLayerEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-010-b: designLayer.enabled: false → workspaceOpts.designLayerEnabled === false
// ---------------------------------------------------------------------------

describe("TC-010-b: designLayer.enabled: false → workspaceOpts.designLayerEnabled is false", () => {
  it("prepare() sets workspaceOpts.designLayerEnabled to false when designLayer.enabled is false", async () => {
    const config: SpecRunnerConfig = {
      version: 1,
      runtime: "local",
      agents: {},
      designLayer: { enabled: false },
    };
    const runtime = makeFakeRuntime();
    const command = makeCommand(makeFakePreflightResult(config), runtime);

    const result = await command.testPrepare();

    expect(result.workspaceOpts.designLayerEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-010-c: designLayer absent → workspaceOpts.designLayerEnabled === false
// ---------------------------------------------------------------------------

describe("TC-010-c: designLayer absent → workspaceOpts.designLayerEnabled is false", () => {
  it("prepare() sets workspaceOpts.designLayerEnabled to false when designLayer is absent from config", async () => {
    const config: SpecRunnerConfig = {
      version: 1,
      runtime: "local",
      agents: {},
      // designLayer intentionally omitted
    };
    const runtime = makeFakeRuntime();
    const command = makeCommand(makeFakePreflightResult(config), runtime);

    const result = await command.testPrepare();

    expect(result.workspaceOpts.designLayerEnabled).toBe(false);
  });
});
