/**
 * T-07: StepExecutor activation gate tests.
 *
 * Verifies:
 * - Mismatched activation conditions → agent NOT called, verdict "skipped" recorded
 * - Matching activation conditions → agent IS called normally
 * - No activation on step → gate NOT evaluated, listChangedFiles NOT called
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-activation-test-"));
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

function makeMinimalState(jobId = "test-job-id"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
  };
}

function makeMinimalDeps(
  runtimeStrategy: RuntimeStrategy,
): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "test content",
      adr: false,
    },
    slug: "test-slug",
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
    runtimeStrategy,
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "security",
    agent: {
      name: "specrunner-security",
      role: "code-review" as never,
      model: "claude-sonnet-4-6",
      system: "system prompt",
      tools: [],
    },
    buildMessage: () => "user message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makeRuntimeStrategy(
  listChangedFiles: (base: string, cwd: string, branch: string | null) => Promise<string[]>,
): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner() { return { async run() { return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 }; } }; },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as never; },
    registerCleanup() { return {} as never; },
    async teardown() {},
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async commitFinalState() {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    listChangedFiles,
  };
}

// ---------------------------------------------------------------------------
// Test: mismatched activation → skip, no agent call
// ---------------------------------------------------------------------------

describe("executor activation gate — skip when conditions not met", () => {
  it("does not call agent runner when requestType does not match", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const listChangedFiles = vi.fn().mockResolvedValue([]);
    const strategy = makeRuntimeStrategy(listChangedFiles);

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      activation: { requestTypes: ["spec-change"] },
    });

    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    const result = await executor.execute(step, state, makeMinimalDeps(strategy));

    // Agent should NOT have been called
    expect(runMock).not.toHaveBeenCalled();
    // Verdict should be "skipped"
    const run = result.steps?.["security"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.skipReason).toBeDefined();
    expect(run?.outcome.skipReason).toContain("bug-fix");
  });

  it("records skipReason describing the condition mismatch", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeRuntimeStrategy(vi.fn().mockResolvedValue([]));

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      activation: { paths: ["src/security/**"] },
    });
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    const result = await executor.execute(step, state, makeMinimalDeps(strategy));

    const run = result.steps?.["security"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.skipReason).toContain("src/security/**");
  });
});

// ---------------------------------------------------------------------------
// Test: matching activation → agent called normally
// ---------------------------------------------------------------------------

describe("executor activation gate — proceed when conditions met", () => {
  it("calls agent runner when requestType matches", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const listChangedFiles = vi.fn().mockResolvedValue([]);
    const strategy = makeRuntimeStrategy(listChangedFiles);

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      activation: { requestTypes: ["bug-fix"] },
    });
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(runMock).toHaveBeenCalledOnce();
  });

  it("calls agent runner when paths match", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const listChangedFiles = vi.fn().mockResolvedValue(["src/auth/login.ts"]);
    const strategy = makeRuntimeStrategy(listChangedFiles);

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      activation: { paths: ["src/auth/**"] },
    });
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(runMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test: no activation → gate not evaluated, listChangedFiles not called
// ---------------------------------------------------------------------------

describe("executor activation gate — no-op for steps without activation", () => {
  it("does NOT call listChangedFiles when step has no activation", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const listChangedFiles = vi.fn().mockResolvedValue([]);
    const strategy = makeRuntimeStrategy(listChangedFiles);

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    // Step with NO activation field
    const step = makeAgentStep();
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(listChangedFiles).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledOnce();
  });
});
