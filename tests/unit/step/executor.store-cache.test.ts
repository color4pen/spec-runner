/**
 * Unit tests for StepExecutor.getStore() caching behaviour.
 * TC-13 (must): getStore() called with the same jobId → storeFactory invoked exactly once
 * TC-14 (should): getStore() called with a different jobId → storeFactory invoked again
 *
 * getStore() is private, so these tests exercise the cache indirectly by calling
 * execute() with CliStep mocks and a spy storeFactory.
 * Each execute() call internally calls getStore() twice (runCliStep + finalizeStep).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps, StoreFactory } from "../../../src/core/types.js";
import type { JobStateStore } from "../../../src/store/job-state-store.js";
import type { AgentRunner } from "../../../src/core/port/agent-runner.js";
import type { CliStep } from "../../../src/core/step/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Create a minimal fake JobStateStore that doesn't touch the filesystem. */
function makeFakeStore(initialState: JobState): JobStateStore {
  let state = initialState;
  return {
    load: vi.fn().mockResolvedValue(state),
    persist: vi.fn().mockImplementation(async (s: JobState) => { state = s; }),
    appendHistory: vi.fn().mockImplementation(async (s: JobState) => s),
    update: vi.fn().mockImplementation(async (s: JobState, patch: Partial<JobState>) => ({
      ...s,
      ...patch,
      updatedAt: new Date().toISOString(),
    })),
    fail: vi.fn().mockImplementation(async (s: JobState) => s),
    getLatestStepRun: vi.fn().mockReturnValue(undefined),
    appendStepRun: vi.fn().mockImplementation(async (s: JobState) => s),
  } as unknown as JobStateStore;
}

function makeMinimalState(jobId: string = "test-job-id"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

function makeNoopCliStep(name: string = "verification"): CliStep {
  return {
    kind: "cli",
    name,
    run: vi.fn().mockResolvedValue(undefined),
    resultFilePath: () => "/nonexistent/result.md",
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    completionVerdict: "approved" as const,
  } as unknown as CliStep;
}

function makeMinimalDeps(): Omit<PipelineDeps, "storeFactory"> {
  return {
    config: {
      version: 1,
      agents: { design: { agentId: "a1", definitionHash: "sha", lastSyncedAt: "2026-01-01" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
  };
}

// TC-13 (must): same jobId — storeFactory called exactly once
describe("TC-13: getStore() same jobId caching", () => {
  it("storeFactory is called exactly once when execute() is called 3 times with the same jobId", async () => {
    const jobId = "cache-test-job-001";
    const initialState = makeMinimalState(jobId);
    const fakeStore = makeFakeStore(initialState);

    const storeFactory = vi.fn((_id: string): JobStateStore => fakeStore);

    const mockRunner = { run: vi.fn() } as unknown as AgentRunner;
    const executor = new StepExecutor(
      new EventBus(),
      mockRunner,
      storeFactory,
    );

    const deps: PipelineDeps = { ...makeMinimalDeps(), storeFactory };
    const step = makeNoopCliStep("verification");

    // Call execute() 3 times — each call invokes getStore() twice internally
    await executor.execute(step, initialState, deps);
    await executor.execute(step, initialState, deps);
    await executor.execute(step, initialState, deps);

    // storeFactory must have been called exactly once regardless of internal getStore() count
    expect(storeFactory).toHaveBeenCalledTimes(1);
    expect(storeFactory).toHaveBeenCalledWith(jobId);
  });
});

// TC-14 (should): different jobId — storeFactory called again
describe("TC-14: getStore() different jobId triggers new storeFactory call", () => {
  it("storeFactory is called again when execute() is called with a different jobId", async () => {
    const jobId1 = "cache-test-job-A";
    const jobId2 = "cache-test-job-B";
    const state1 = makeMinimalState(jobId1);
    const state2 = makeMinimalState(jobId2);

    const fakeStore1 = makeFakeStore(state1);
    const fakeStore2 = makeFakeStore(state2);

    const storeFactory = vi.fn((id: string): JobStateStore => (id === jobId1 ? fakeStore1 : fakeStore2));

    const mockRunner = { run: vi.fn() } as unknown as AgentRunner;
    const executor = new StepExecutor(
      new EventBus(),
      mockRunner,
      storeFactory,
    );

    const deps: PipelineDeps = { ...makeMinimalDeps(), storeFactory };
    const step = makeNoopCliStep("verification");

    await executor.execute(step, state1, deps);
    await executor.execute(step, state2, deps);

    // Two different jobIds → factory called twice
    expect(storeFactory).toHaveBeenCalledTimes(2);
    expect(storeFactory).toHaveBeenNthCalledWith(1, jobId1);
    expect(storeFactory).toHaveBeenNthCalledWith(2, jobId2);
  });
});
