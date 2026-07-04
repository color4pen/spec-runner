/**
 * Unit tests for resume-prompt injection (T-10a)
 *
 * TC-RESUME-PROMPT-001: options.prompt が設定されているとき PrepareResult.resumePrompt に値が入る
 * TC-RESUME-PROMPT-002: options.prompt が未設定のとき PrepareResult.resumePrompt が undefined
 *
 * CommandRunner.execute() レベルで検証:
 * prepare() が resumePrompt を持つ PrepareResult を返したとき、
 * execute() が deps.resumePrompt に伝播するかを確認する。
 *
 * TC-011: ResumeCommand.prepare() の workspaceOpts に designLayerEnabled が含まれない
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
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import { closeVerboseLog, setLogLevel } from "../../../../src/logger/stdout.js";
import { ResumeCommand } from "../../../../src/core/command/resume.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";

// ---------------------------------------------------------------------------
// Module mocks for TC-011 (hoisted by Vitest — do not affect TestCommand tests)
// ---------------------------------------------------------------------------

vi.mock("../../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    runtime: "local",
    agents: {},
  }),
}));

vi.mock("../../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({
    title: "Test Request",
    type: "new-feature",
    slug: "resume-test-slug",
    baseBranch: "main",
    content: "# Test\n\n## Meta\n\n- **type**: new-feature",
    adr: false,
  }),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-cmd-prompt-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  (vi as unknown as { resetModules?: () => void }).resetModules?.();
});

// ---------------------------------------------------------------------------
// Helpers (adapted from runner.test.ts)
// ---------------------------------------------------------------------------

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
    steps: {},
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

/** Deps object returned by the mock runtime.buildDeps(). Same reference is mutated by execute(). */
let capturedDeps: PipelineDeps;

function buildMockRuntime(): RuntimeStrategy {
  capturedDeps = {
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "test", adr: false },
    slug: "test-slug",
    config: { version: 1, runtime: "local", agents: {} },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: makeStoreFactory(tempDir),
    cwd: "/worktree",
  } as unknown as PipelineDeps;

  return {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue(NOOP_WORKSPACE),
    buildDeps: vi.fn().mockReturnValue(capturedDeps),
    registerCleanup: vi.fn().mockReturnValue(NOOP_HANDLE),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    bootstrapJob: vi.fn().mockRejectedValue(new Error("not implemented in test")),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue([]),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
  };
}

class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly prepareResult: PrepareResult,
  ) {
    super(runtime, new EventBus());
  }

  protected async prepare(): Promise<PrepareResult> {
    return this.prepareResult;
  }
}

// Mock pipeline to return a successful state
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

// ---------------------------------------------------------------------------
// TC-RESUME-PROMPT-001: resumePrompt が PrepareResult に設定されているとき deps に伝播する
// ---------------------------------------------------------------------------

describe("TC-RESUME-PROMPT-001: PrepareResult.resumePrompt が deps.resumePrompt に伝播する", () => {
  it("準備された PrepareResult が resumePrompt を持つとき、execute() が deps.resumePrompt を設定する", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(
      runtime,
      buildPrepareResult({ resumePrompt: "手動で foo.ts の import を修正済み" }),
    );

    await command.execute();

    // deps is the same object reference returned by buildDeps (mutated by execute)
    expect(capturedDeps.resumePrompt).toBe("手動で foo.ts の import を修正済み");
  });
});

// ---------------------------------------------------------------------------
// TC-RESUME-PROMPT-002: resumePrompt が未設定のとき deps.resumePrompt は undefined のまま
// ---------------------------------------------------------------------------

describe("TC-RESUME-PROMPT-002: PrepareResult に resumePrompt がないとき deps.resumePrompt は undefined", () => {
  it("resumePrompt が未設定の PrepareResult のとき、deps.resumePrompt は undefined のまま", async () => {
    const runtime = buildMockRuntime();
    const command = new TestCommand(
      runtime,
      buildPrepareResult(), // no resumePrompt
    );

    await command.execute();

    expect(capturedDeps.resumePrompt).toBeUndefined();
  });
});

describe("resumeContext snapshot propagation", () => {
  it("prepared resumeContext is propagated into PipelineDeps", async () => {
    const runtime = buildMockRuntime();
    const resumeContext = {
      resumePoint: {
        step: "implementer",
        reason: "escalation",
        iterationsExhausted: 2,
      },
    };
    const command = new TestCommand(
      runtime,
      buildPrepareResult({ resumeContext }),
    );

    await command.execute();

    expect(capturedDeps.resumeContext).toEqual(resumeContext);
  });
});

// ---------------------------------------------------------------------------
// TC-011: ResumeCommand.prepare() の workspaceOpts に designLayerEnabled が含まれない
//
// Non-Goal（resume では ahead 検出しない）を automated test で固定する。
// ResumeCommand.ts は変更されておらず実装は正しいが、回帰を自動検出する
// テストが存在しなかったため追加する。
// ---------------------------------------------------------------------------

/**
 * Thin subclass that exposes the protected prepare() method for testing.
 */
class TestableResumeCommand extends ResumeCommand {
  public async testPrepare(): Promise<PrepareResult> {
    return this.prepare();
  }
}

/**
 * Build a minimal RuntimeStrategy mock for TC-011.
 * (ResumeCommand.prepare() does not call setupWorkspace — that happens in execute().)
 */
function buildResumeTestRuntime(): RuntimeStrategy {
  return {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: "/worktree" } as WorkspaceContext),
    buildDeps: vi.fn().mockReturnValue({}),
    registerCleanup: vi.fn().mockReturnValue({} as CleanupHandle),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    bootstrapJob: vi.fn().mockRejectedValue(new Error("not implemented")),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Create an awaiting-resume job state on disk so that resolveJobStateBySlug
 * can find it via JobStateStore.list().
 */
async function makeAwaitingResumeState(slug: string, dir: string): Promise<JobState> {
  const state = buildInitialJobState({
    request: {
      path: path.join(dir, "specrunner", "changes", slug, "request.md"),
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });

  const awaitingState: JobState = {
    ...state,
    status: "awaiting-resume",
    step: "code-review",
    resumePoint: {
      step: "code-review",
      reason: "escalation",
      iterationsExhausted: 1,
    },
  };

  // Write state.json and events.jsonl so JobStateStore.list() finds this job.
  const slugDir = path.join(dir, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId: awaitingState.jobId,
      createdAt: awaitingState.createdAt,
      updatedAt: awaitingState.updatedAt,
      request: awaitingState.request,
      repository: awaitingState.repository,
      session: null,
      step: awaitingState.step,
      status: awaitingState.status,
      resumePoint: awaitingState.resumePoint,
      branch: awaitingState.branch ?? null,
      error: null,
      steps: {},
    }, null, 2),
    "utf-8",
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

  return awaitingState;
}

describe("TC-011: ResumeCommand.prepare() の workspaceOpts.designLayerEnabled は undefined", () => {
  it("workspaceOpts.designLayerEnabled が undefined である（resume path は ahead 検出しない）", async () => {
    const slug = "resume-test-slug";
    await makeAwaitingResumeState(slug, tempDir);

    const runtime = buildResumeTestRuntime();
    const command = new TestableResumeCommand(
      runtime,
      new EventBus(),
      slug,
      { cwd: tempDir },
    );

    const result = await command.testPrepare();

    // Non-Goal: resume path does NOT pass designLayerEnabled to workspaceOpts.
    expect(result.workspaceOpts.designLayerEnabled).toBeUndefined();
  });
});
