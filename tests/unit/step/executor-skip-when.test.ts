/**
 * T-02 (reduce-added-agent-turns): StepExecutor skipWhen gate tests.
 *
 * Verifies:
 * - skipWhen returning non-null → agent NOT called, verdict "skipped" recorded
 * - skipWhen returning null → agent IS called normally
 * - skipWhen undefined → gate not evaluated (backward compat)
 * - Existing activation gate behavior unchanged (parallel axis)
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
import type { AgentRunner } from "../../../src/core/port/agent-runner.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-skip-when-test-"));
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
  return { version: 1, runtime: "local", agents: {} };
}

function makeMinimalDeps(runtimeStrategy: RuntimeStrategy): PipelineDeps {
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

function makeMinimalRuntimeStrategy(): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner() {
      return { async run() { return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 }; } };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as never; },
    registerCleanup() { return {} as never; },
    async teardown() {},
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async validateStepOutputs() { return { violations: [] }; },
    async commitFinalState() {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "test-step",
    agent: {
      name: "specrunner-test",
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

// ---------------------------------------------------------------------------
// Test: skipWhen returning non-null → skip, no agent call
// ---------------------------------------------------------------------------

describe("skipWhen gate — skip when predicate returns non-null", () => {
  it("does not call agent runner when skipWhen returns a reason", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      skipWhen: (_state, _deps) => "deterministic skip reason",
    });

    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    const result = await executor.execute(step, state, makeMinimalDeps(strategy));

    // Agent should NOT have been called
    expect(runMock).not.toHaveBeenCalled();

    // Verdict should be "skipped" with the reason set
    const run = result.steps?.["test-step"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.skipReason).toBe("deterministic skip reason");
  });

  it("records the exact skipReason string returned by skipWhen", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const customReason = "adr: false — ADR generation is disabled for this request";
    const step = makeAgentStep({
      skipWhen: () => customReason,
    });

    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    const result = await executor.execute(step, state, makeMinimalDeps(strategy));

    const run = result.steps?.["test-step"]?.[0];
    expect(run?.outcome.skipReason).toBe(customReason);
  });
});

// ---------------------------------------------------------------------------
// Test: skipWhen returning null → agent called normally
// ---------------------------------------------------------------------------

describe("skipWhen gate — proceed when predicate returns null", () => {
  it("calls agent runner when skipWhen returns null", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({
      skipWhen: () => null,
    });

    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(runMock).toHaveBeenCalledOnce();
  });

  it("verdict is NOT 'skipped' when skipWhen returns null", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    const step = makeAgentStep({ skipWhen: () => null });
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    const result = await executor.execute(step, state, makeMinimalDeps(strategy));

    const run = result.steps?.["test-step"]?.[0];
    expect(run?.outcome.verdict).not.toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Test: skipWhen undefined → gate not evaluated (backward compat)
// ---------------------------------------------------------------------------

describe("skipWhen gate — no-op for steps without skipWhen", () => {
  it("calls agent runner when step has no skipWhen", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    // Step with NO skipWhen field
    const step = makeAgentStep();
    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(runMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test: skipWhen uses state and deps (pure predicate with injected context)
// ---------------------------------------------------------------------------

describe("skipWhen gate — state and deps are passed correctly", () => {
  it("skipWhen receives the current state and deps", async () => {
    const runMock = vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const mockRunner: AgentRunner = { run: runMock };
    const strategy = makeMinimalRuntimeStrategy();

    const events = new EventBus();
    const executor = new StepExecutor(events, mockRunner, makeStoreFactory(tempDir));

    let capturedState: JobState | undefined;
    let capturedDepsAdr: boolean | undefined;

    const step = makeAgentStep({
      skipWhen: (s, d) => {
        capturedState = s;
        capturedDepsAdr = d.request.adr;
        return null; // don't skip, just capture
      },
    });

    const state = makeMinimalState();
    await makeStoreFactory(tempDir)(state.jobId).persist(state);

    await executor.execute(step, state, makeMinimalDeps(strategy));

    expect(capturedState).toBeDefined();
    expect(capturedDepsAdr).toBe(false); // makeMinimalDeps passes adr: false
  });
});
