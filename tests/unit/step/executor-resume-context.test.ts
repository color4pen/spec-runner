/**
 * Tests for resume context assembly in StepExecutor (via buildStepContext).
 *
 * TC-RC-001: code-fixer first run → ctx.session.resumeSessionId is undefined
 * TC-RC-002: code-fixer second run (previous sessionId present) → resumeSessionId matches
 * TC-RC-003: non-fixer step (implementer) → resumeSessionId always undefined
 * TC-RC-004: deps.resumePrompt is consumed (cleared) after the agent step executes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import { PRODUCER_REPORT_TOOL } from "../../../src/core/step/report-tool.js";
import type { AgentStepName } from "../../../src/kernel/agent-definition.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-resume-ctx-test-"));
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
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string, stepName = "code-fixer"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug", baseBranch: "main" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: stepName,
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeJobStateWithPreviousRun(
  jobId: string,
  stepName: string,
  sessionId: string,
): JobState {
  const previousRun: StepRun = {
    attempt: 1,
    sessionId,
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: null,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  };
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug", baseBranch: "main" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: stepName,
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: { [stepName]: [previousRun] },
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

/**
 * Create an AgentRunner that captures the AgentRunContext passed to run().
 */
function makeCapturingRunner(): {
  runner: AgentRunner;
  getCapturedCtx: () => AgentRunContext | undefined;
} {
  let capturedCtx: AgentRunContext | undefined;
  const runner: AgentRunner = {
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      capturedCtx = ctx;
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    },
  };
  return { runner, getCapturedCtx: () => capturedCtx };
}

function makeBaseStrategy(): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner: () => ({ async run(): Promise<AgentRunResult> { return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 }; } }),
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(): Promise<string | null> { return null; },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {},
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs: { path: string }[]) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async validateStepOutputs() { return { violations: [] }; },
    async listChangedFiles() { return []; },
  };
}

function makeDeps(runtimeStrategy?: RuntimeStrategy, extra?: Partial<PipelineDeps>): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    runtimeStrategy,
    ...extra,
  };
}

function makeAgentStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { name: `specrunner-${name}`, role: name as AgentStepName, model: "claude-sonnet-4-5", system: "test", tools: [] },
    buildMessage: () => "test message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: PRODUCER_REPORT_TOOL,
    completionVerdict: "success",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-RC-001: code-fixer first run → resumeSessionId undefined
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-RC-001: code-fixer first run → no resumeSessionId", () => {
  it("passes undefined resumeSessionId to runner when no previous run exists", async () => {
    const jobId = "tc-rc-001";
    const state = makeJobState(jobId, "code-fixer");
    await seedJobState(jobId, state);

    const { runner, getCapturedCtx } = makeCapturingRunner();
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    await executor.execute(makeAgentStep("code-fixer"), state, makeDeps(makeBaseStrategy()));

    const ctx = getCapturedCtx();
    expect(ctx).toBeDefined();
    expect(ctx?.session.resumeSessionId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-RC-002: code-fixer second run → resumeSessionId matches previous session
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-RC-002: code-fixer second run → resumeSessionId from previous run", () => {
  it("passes previous session ID as resumeSessionId when previous run has a session", async () => {
    const jobId = "tc-rc-002";
    const prevSessionId = "session-abc-12345";
    const state = makeJobStateWithPreviousRun(jobId, "code-fixer", prevSessionId);
    await seedJobState(jobId, state);

    const { runner, getCapturedCtx } = makeCapturingRunner();
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    await executor.execute(makeAgentStep("code-fixer"), state, makeDeps(makeBaseStrategy()));

    const ctx = getCapturedCtx();
    expect(ctx).toBeDefined();
    expect(ctx?.session.resumeSessionId).toBe(prevSessionId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-RC-003: non-fixer step → resumeSessionId always undefined
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-RC-003: non-fixer step → resumeSessionId always undefined", () => {
  it("does not set resumeSessionId for non-fixer steps even if state has previous runs", async () => {
    const jobId = "tc-rc-003";
    // Seed state where implementer has a previous run with a sessionId.
    // buildStepContext should NOT propagate it because implementer is not a fixer step.
    const state = makeJobStateWithPreviousRun(jobId, "implementer", "should-not-appear");
    await seedJobState(jobId, state);

    const { runner, getCapturedCtx } = makeCapturingRunner();
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    await executor.execute(makeAgentStep("implementer"), state, makeDeps(makeBaseStrategy()));

    const ctx = getCapturedCtx();
    expect(ctx).toBeDefined();
    // implementer is not in FIXER_STEP_NAMES → resumeSessionId must be undefined
    expect(ctx?.session.resumeSessionId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-RC-004: deps.resumePrompt is consumed (one-shot) after the step executes
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-RC-004: deps.resumePrompt consumed after step", () => {
  it("clears deps.resumePrompt to undefined after the agent step runs", async () => {
    const jobId = "tc-rc-004";
    const state = makeJobState(jobId, "code-fixer");
    await seedJobState(jobId, state);

    const { runner } = makeCapturingRunner();
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const deps = makeDeps(makeBaseStrategy(), { resumePrompt: "resume note from operator" });
    expect(deps.resumePrompt).toBe("resume note from operator");

    await executor.execute(makeAgentStep("code-fixer"), state, deps);

    // After execution, resumePrompt must be cleared (one-shot consumption).
    expect(deps.resumePrompt).toBeUndefined();
  });
});
