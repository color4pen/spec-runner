/**
 * TC-017: runRunCore({ inboxOrigin: true }) で jobState.inboxOrigin が true に設定される
 *   Source: tasks.md > T-04
 *
 * GIVEN inboxOrigin: true を options に含む PipelineRunCommand の呼び出し
 * WHEN PipelineRunCommand.prepare() が実行される
 * THEN bootstrap 後の jobState.inboxOrigin === true が設定されている
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
import type { JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../src/core/reviewers/load.js", () => ({
  loadReviewerDefinitions: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-inbox-origin-cmd-test-"));
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

function makeFakeRuntime(): RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } {
  const initialState = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature", slug: "test-slug" },
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
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
    canDeriveChangedFiles: () => true,
  };
}

class TestablePipelineRunCommand extends PipelineRunCommand {
  public async testPrepare(): Promise<PrepareResult> {
    return this.prepare();
  }
}

// ---------------------------------------------------------------------------
// TC-017: inboxOrigin: true → jobState.inboxOrigin === true
// ---------------------------------------------------------------------------

describe("TC-017: runRunCore({ inboxOrigin: true }) で jobState.inboxOrigin が true に設定される", () => {
  it("TC-017: inboxOrigin: true が PipelineRunOptions に渡されたとき、prepare() 後の jobState.inboxOrigin が true", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult();

    const command = new TestablePipelineRunCommand(
      runtime,
      new EventBus(),
      "/fake/path/to/request.md",
      preflightResult,
      {
        cwd: tempDir,
        inboxOrigin: true,
      },
    );

    const result = await command.testPrepare();
    const jobState = result.jobState as JobState & { inboxOrigin?: boolean };

    expect(jobState.inboxOrigin).toBe(true);
  });

  it("TC-017: inboxOrigin を指定しない場合、jobState.inboxOrigin は undefined（通常 run 経路の回帰防止）", async () => {
    const runtime = makeFakeRuntime();
    const preflightResult = makeFakePreflightResult();

    const command = new TestablePipelineRunCommand(
      runtime,
      new EventBus(),
      "/fake/path/to/request.md",
      preflightResult,
      { cwd: tempDir }, // inboxOrigin なし
    );

    const result = await command.testPrepare();
    const jobState = result.jobState as JobState & { inboxOrigin?: boolean };

    // inboxOrigin が未指定のとき、jobState.inboxOrigin は undefined（falsy）のまま
    expect(jobState.inboxOrigin).toBeFalsy();
  });
});
