/**
 * Integration tests: pipeline terminal notifications via notifyJobTerminal.
 *
 * TC-PN-001: issueNumber set + completion (awaiting-archive) → createIssueComment called
 * TC-PN-002: issueNumber set + escalation loop-exhausted (awaiting-resume) → createIssueComment called
 * TC-PN-003: issueNumber absent → createIssueComment NOT called
 * TC-PN-004: createIssueComment rejects → pipeline final state unchanged (best-effort)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState, ErrorInfo, HistoryEntry } from "../../../../src/state/schema.js";
import type { PipelineDeps, StoreFactory } from "../../../../src/core/types.js";
import type { JobStateStore } from "../../../../src/store/job-state-store.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFakeStore(initialState: JobState) {
  let state = initialState;
  const persistedStates: JobState[] = [];

  const fakeStore = {
    async load() { return { ...state, steps: (state.steps ?? {}) as Record<string, import("../../../../src/state/schema.js").StepRun[]> }; },
    async persist(s: JobState) { state = s; persistedStates.push(s); },
    async appendHistory(s: JobState, entry: HistoryEntry): Promise<JobState> {
      const updated = { ...s, history: [...(s.history ?? []), entry], updatedAt: new Date().toISOString() };
      await fakeStore.persist(updated);
      return updated;
    },
    async update(s: JobState, patch: Partial<JobState>): Promise<JobState> {
      const updated = { ...s, ...patch, updatedAt: new Date().toISOString() };
      await fakeStore.persist(updated);
      return updated;
    },
    async fail(s: JobState, errorInfo: ErrorInfo, step?: string): Promise<JobState> {
      const updated = { ...s, status: "failed" as const, error: errorInfo, step: step ?? s.step, updatedAt: new Date().toISOString() };
      await fakeStore.persist(updated);
      return updated;
    },
    getLatestStepRun(_s: JobState, _stepName: string) { return undefined; },
    persistedStates,
    get currentState() { return state; },
  } satisfies Partial<JobStateStore> & { persistedStates: JobState[]; currentState: JobState };

  return fakeStore;
}

function createFakeStoreFactory(initialState: JobState): { factory: StoreFactory; store: ReturnType<typeof createFakeStore> } {
  const store = createFakeStore(initialState);
  const factory: StoreFactory = (_jobId: string) => store as unknown as JobStateStore;
  return { factory, store };
}

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-notification-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "new-feature", slug: "my-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/my-slug-12345678",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(storeFactory: StoreFactory, githubClientOverrides: Record<string, unknown> = {}): PipelineDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "new-feature", title: "Test", slug: "my-slug", baseBranch: "main", content: "content", adr: false },
    slug: "my-slug",
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
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
      ...githubClientOverrides,
    } as PipelineDeps["githubClient"],
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory,
  };
}

function makeStep(name: string, kind: "agent" | "cli" = "agent"): Step {
  if (kind === "cli") {
    return {
      kind: "cli",
      name,
      run: vi.fn().mockResolvedValue(undefined),
      resultFilePath: () => `/tmp/${name}-result.md`,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };
  }
  return {
    kind: "agent",
    name,
    agent: { name: "test", role: name as import("../../../../src/state/schema.js").AgentStepName, model: "claude-sonnet-4-5", system: "", tools: [] },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

// ---------------------------------------------------------------------------
// TC-PN-001: completion → createIssueComment called with PR URL
// ---------------------------------------------------------------------------

describe("TC-PN-001: issueNumber set + completion → createIssueComment called", () => {
  it("calls createIssueComment with PR URL when job completes", async () => {
    const state = makeMinimalState({ issueNumber: 42 });
    const { factory, store } = createFakeStoreFactory(state);
    const createIssueCommentSpy = vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/42#issuecomment-1" });
    const deps = makeMinimalDeps(factory, { createIssueComment: createIssueCommentSpy });

    // Executor returns a state with a verdict that leads to "end" and sets pullRequest
    const completedState: JobState = {
      ...state,
      status: "running",
      pullRequest: { url: "https://github.com/testowner/testrepo/pull/99", number: 99, createdAt: "2026-01-01T00:00:00.000Z" },
      steps: {
        design: [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success" as const, findingsPath: null, error: null },
          startedAt: "2026-01-01",
          endedAt: "2026-01-01",
        }],
      },
    };

    const executeSpy = vi.fn().mockResolvedValue(completedState);
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    // Also update the store to track the pullRequest in final state
    store.persist({ ...completedState });

    const pipeline = new Pipeline({
      steps: new Map([["design", makeStep("design")]]),
      transitions: [{ step: "design", on: "success", to: "end" }],
      maxIterations: 3,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "design",
    });

    const finalState = await pipeline.run("design", state, deps);

    expect(finalState.status).toBe("awaiting-archive");
    expect(createIssueCommentSpy).toHaveBeenCalledOnce();
    const [owner, repo, issueNumber, body] = createIssueCommentSpy.mock.calls[0] as [string, string, number, string];
    expect(owner).toBe("testowner");
    expect(repo).toBe("testrepo");
    expect(issueNumber).toBe(42);
    expect(body).toContain('kind="completed"');
  });
});

// ---------------------------------------------------------------------------
// TC-PN-002: escalation → createIssueComment called with resume instructions
// ---------------------------------------------------------------------------

describe("TC-PN-002: issueNumber set + escalation → createIssueComment called", () => {
  it("calls createIssueComment with resume instructions when job escalates", async () => {
    const state = makeMinimalState({ issueNumber: 42 });
    const { factory } = createFakeStoreFactory(state);
    const createIssueCommentSpy = vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/42#issuecomment-1" });
    const deps = makeMinimalDeps(factory, { createIssueComment: createIssueCommentSpy });

    // Executor returns a failed state to trigger escalation
    const failedState: JobState = {
      ...state,
      status: "failed",
      error: { code: "AGENT_STEP_FAILED", message: "code-review failed", hint: "" },
    };

    const executeSpy = vi.fn().mockResolvedValue(failedState);
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([["code-review", makeStep("code-review")]]),
      transitions: [
        { step: "code-review", on: "error", to: "escalate" },
        { step: "code-review", on: "approved", to: "end" },
      ],
      maxIterations: 3,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "code-review",
    });

    const finalState = await pipeline.run("code-review", state, deps);

    expect(finalState.status).toBe("awaiting-resume");
    expect(createIssueCommentSpy).toHaveBeenCalledOnce();
    const [, , issueNumber, body] = createIssueCommentSpy.mock.calls[0] as [string, string, number, string];
    expect(issueNumber).toBe(42);
    expect(body).toContain('kind="escalation"');
    expect(body).toContain("specrunner job resume");
  });
});

// ---------------------------------------------------------------------------
// TC-PN-003: issueNumber absent → createIssueComment NOT called
// ---------------------------------------------------------------------------

describe("TC-PN-003: issueNumber absent → createIssueComment NOT called", () => {
  it("does not call createIssueComment when issueNumber is not set", async () => {
    // No issueNumber in state
    const state = makeMinimalState();
    const { factory } = createFakeStoreFactory(state);
    const createIssueCommentSpy = vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" });
    const deps = makeMinimalDeps(factory, { createIssueComment: createIssueCommentSpy });

    const completedState: JobState = {
      ...state,
      status: "running",
      steps: {
        design: [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success" as const, findingsPath: null, error: null },
          startedAt: "2026-01-01",
          endedAt: "2026-01-01",
        }],
      },
    };

    const executeSpy = vi.fn().mockResolvedValue(completedState);
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([["design", makeStep("design")]]),
      transitions: [{ step: "design", on: "success", to: "end" }],
      maxIterations: 3,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "design",
    });

    const finalState = await pipeline.run("design", state, deps);

    expect(finalState.status).toBe("awaiting-archive");
    expect(createIssueCommentSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-PN-004: createIssueComment rejects → final state unchanged
// ---------------------------------------------------------------------------

describe("TC-PN-004: createIssueComment rejects → pipeline final state unchanged", () => {
  it("pipeline still returns awaiting-archive when createIssueComment throws", async () => {
    const state = makeMinimalState({ issueNumber: 42 });
    const { factory } = createFakeStoreFactory(state);
    const createIssueCommentSpy = vi.fn().mockRejectedValue(new Error("network failure"));
    const deps = makeMinimalDeps(factory, { createIssueComment: createIssueCommentSpy });

    const completedState: JobState = {
      ...state,
      status: "running",
      steps: {
        design: [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "success" as const, findingsPath: null, error: null },
          startedAt: "2026-01-01",
          endedAt: "2026-01-01",
        }],
      },
    };

    const executeSpy = vi.fn().mockResolvedValue(completedState);
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([["design", makeStep("design")]]),
      transitions: [{ step: "design", on: "success", to: "end" }],
      maxIterations: 3,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "design",
    });

    const finalState = await pipeline.run("design", state, deps);

    // Final status must be awaiting-archive regardless of notification failure
    expect(finalState.status).toBe("awaiting-archive");
    expect(createIssueCommentSpy).toHaveBeenCalledOnce();
  });
});
