/**
 * Tests for storeFactory DI in Pipeline and StepExecutor.
 * TC-19: fake storeFactory observes escalation persistence
 * TC-20: fake storeFactory observes loop exhaustion persistence
 * TC-21: fake storeFactory suppresses real file I/O
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { StoreFactory } from "../../../../src/core/types.js";
import type { JobStateStore } from "../../../../src/store/job-state-store.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { ErrorInfo, HistoryEntry } from "../../../../src/state/schema.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Create an in-memory fake JobStateStore that records calls without touching the filesystem. */
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

/** Create a storeFactory that uses a fake store instead of real file I/O. */
function createFakeStoreFactory(initialState: JobState): { factory: StoreFactory; store: ReturnType<typeof createFakeStore> } {
  const store = createFakeStore(initialState);
  const factory: StoreFactory = (_jobId: string) => store as unknown as JobStateStore;
  return { factory, store };
}

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "fake-store-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(storeFactory: StoreFactory): PipelineDeps {
  return {
    config: {
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
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
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory,
  };
}

function makeStep(name: string, verdict: string | null = null, status: "running" | "failed" = "running"): Step {
  return {
    kind: "agent",
    name,
    agent: { name: "test", role: name as import("../../../../src/state/schema.js").AgentStepName, model: "claude-sonnet-4-5", system: "", tools: [] },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: verdict as import("../../../../src/state/schema.js").Verdict | null, findingsPath: null }),
  };
}

// TC-19: fake storeFactory observes escalation persistence
describe("TC-19: fake storeFactory observes escalation persistence", () => {
  it("persist() is called on fake store when pipeline escalates", async () => {
    const state = makeMinimalState();
    const { factory, store } = createFakeStoreFactory(state);
    const deps = makeMinimalDeps(factory);

    const escalatingDesignResult: JobState = {
      ...state,
      status: "failed",
      error: { code: "AGENT_STEP_FAILED", message: "design failed", hint: "" },
    };

    const executeSpy = vi.fn().mockResolvedValue(escalatingDesignResult);
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const steps = new Map<string, Step>([
      ["design", makeStep("design")],
    ]);

    const pipeline = new Pipeline({
      steps,
      transitions: [
        { step: "design", on: "error", to: "escalate" },
        { step: "design", on: "success", to: "end" },
      ],
      maxIterations: 1,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "design",
    });

    await pipeline.run("design", state, deps);

    // fake store should have been called (persist) during escalation handling
    expect(store.persistedStates.length).toBeGreaterThan(0);
    // final state should be awaiting-resume
    const finalState = store.persistedStates[store.persistedStates.length - 1]!;
    expect(finalState.status).toBe("awaiting-resume");
  });
});

// TC-20: fake storeFactory observes loop exhaustion persistence
describe("TC-20: fake storeFactory observes loop exhaustion persistence", () => {
  it("persist() is called on fake store when loop exhausts", async () => {
    const state = makeMinimalState();
    const { factory, store } = createFakeStoreFactory(state);
    const deps = makeMinimalDeps(factory);

    // spec-review always returns needs-fix to force exhaustion
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "spec-review") {
        return {
          ...currentState,
          status: "running",
          steps: {
            ...currentState.steps,
            "spec-review": [
              ...((currentState.steps?.["spec-review"]) ?? []),
              { attempt: ((currentState.steps?.["spec-review"]?.length ?? 0) + 1), sessionId: null, outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
            ],
          },
        };
      }
      if (step.name === "spec-fixer") {
        return { ...currentState, status: "running" };
      }
      return currentState;
    });

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const steps = new Map<string, Step>([
      ["spec-review", makeStep("spec-review")],
      ["spec-fixer", makeStep("spec-fixer")],
    ]);

    const pipeline = new Pipeline({
      steps,
      transitions: [
        { step: "spec-review", on: "needs-fix", to: "spec-fixer" },
        { step: "spec-review", on: "approved", to: "end" },
        { step: "spec-review", on: "escalation", to: "escalate" },
        { step: "spec-fixer", on: "approved", to: "spec-review" },
        { step: "spec-fixer", on: "error", to: "escalate" },
      ],
      maxIterations: 2,
      executor: mockExecutor,
      events: new EventBus(),
      loopName: "spec-review",
      loopNames: ["spec-review"],
      loopFixerPairs: { "spec-review": "spec-fixer" },
    });

    const result = await pipeline.run("spec-review", state, deps);

    // fake store persist must have been called during loop exhaustion
    expect(store.persistedStates.length).toBeGreaterThan(0);
    // final state should be awaiting-resume with SPEC_REVIEW_RETRIES_EXHAUSTED
    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });
});

// TC-21: fake storeFactory suppresses real file I/O
describe("TC-21: fake storeFactory suppresses real file I/O", () => {
  it("no XDG file writes occur when using fake storeFactory", async () => {
    // Set XDG to a path that should NOT be written to
    const originalXdg = process.env["XDG_DATA_HOME"];
    const fakePath = "/nonexistent-xdg-path-should-not-be-created";
    process.env["XDG_DATA_HOME"] = fakePath;

    try {
      const state = makeMinimalState();
      const { factory } = createFakeStoreFactory(state);
      const deps = makeMinimalDeps(factory);

      const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
      const executeSpy = vi.fn().mockResolvedValue(designResult);
      const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

      const steps = new Map<string, Step>([
        ["design", makeStep("design")],
      ]);

      const pipeline = new Pipeline({
        steps,
        transitions: [
          { step: "design", on: "error", to: "escalate" },
          { step: "design", on: "success", to: "end" },
        ],
        maxIterations: 1,
        executor: mockExecutor,
        events: new EventBus(),
        loopName: "design",
      });

      // This should NOT throw with ENOENT for the fake XDG path
      await expect(pipeline.run("design", state, deps)).resolves.toBeDefined();
    } finally {
      if (originalXdg !== undefined) {
        process.env["XDG_DATA_HOME"] = originalXdg;
      } else {
        delete process.env["XDG_DATA_HOME"];
      }
    }
  });
});
