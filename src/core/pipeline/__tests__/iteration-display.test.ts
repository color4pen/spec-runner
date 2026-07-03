/**
 * T-04: pipeline:iteration:start maxIterations uses step-specific override.
 *
 * Regression test for the `iter N/M` display bug where the `/M` value
 * showed the global maxIterations instead of the step-specific value.
 *
 * Fix: pipeline:iteration:start now uses resolveMaxIterations(currentStep)
 * instead of this.maxIterations.
 */
import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../pipeline.js";
import { EventBus } from "../../event/event-bus.js";
import type { AgentStep } from "../../step/types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "iter-display-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "regression-gate",
    status: "running",
    branch: "feat/example-abc",
    history: [],
    error: null,
    steps: {},
  };
}

function makeStore() {
  return {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async (_state: JobState) => undefined,
    appendInterruption: async () => undefined,
    appendLineage: async () => undefined,
  };
}

/** Executor mock that returns approved for all steps */
function makeApprovedExecutor(store: ReturnType<typeof makeStore>) {
  return {
    execute: vi.fn(async (step: AgentStep, state: JobState) => {
      // Simulate a step result with approved verdict
      const now = new Date().toISOString();
      const stepRuns = [...(state.steps?.[step.name] ?? []), {
        attempt: (state.steps?.[step.name]?.length ?? 0) + 1,
        sessionId: null,
        startedAt: now,
        endedAt: now,
        outcome: { verdict: "approved" as const, findingsPath: null, error: null },
      }];
      const newState: JobState = {
        ...state,
        steps: { ...(state.steps ?? {}), [step.name]: stepRuns },
        updatedAt: now,
      };
      await store.persist(newState);
      return newState;
    }),
  };
}

function makeDeps(store: ReturnType<typeof makeStore>): PipelineDeps {
  return {
    cwd: "/tmp",
    slug: "example",
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Example",
      slug: "example",
      baseBranch: "main",
      content: "Example request",
      adr: false,
      path: "specrunner/changes/example/request.md",
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: vi.fn() as never,
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy: undefined,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Pipeline — T-04: pipeline:iteration:start uses step-specific maxIterations", () => {
  it("regression-gate iteration:start emits maxIterations=3 when maxIterationsByStep has 3 and global is 2", async () => {
    const events = new EventBus();
    const iterationStartEvents: Array<{ step: string; iteration: number; maxIterations: number }> = [];
    events.on("pipeline:iteration:start", (e) => {
      iterationStartEvents.push(e as { step: string; iteration: number; maxIterations: number });
    });

    const store = makeStore();
    const executor = makeApprovedExecutor(store);

    const gateStep: AgentStep = {
      kind: "agent",
      name: "regression-gate",
      agent: {} as never,
      completionVerdict: "approved",
      buildMessage: () => "gate message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const pipeline = new Pipeline({
      steps: new Map([["regression-gate", gateStep]]),
      transitions: [
        { step: "regression-gate", on: "approved", to: "end" },
        { step: "regression-gate", on: "escalation", to: "escalate" },
        { step: "regression-gate", on: "needs-fix", to: "end" },
        { step: "regression-gate", on: "error", to: "escalate" },
      ],
      maxIterations: 2,
      maxIterationsByStep: { "regression-gate": 3 },
      loopName: "regression-gate",
      loopNames: ["regression-gate"],
      executor: executor as never,
      events,
    });

    const state = makeState();
    const deps = makeDeps(store);
    deps.storeFactory = () => store as never;

    await pipeline.run("regression-gate", state, deps);

    // Should have emitted exactly one pipeline:iteration:start for regression-gate
    const gateEvents = iterationStartEvents.filter((e) => e.step === "regression-gate");
    expect(gateEvents.length).toBeGreaterThan(0);

    // The maxIterations in the event must be the step-specific value (3), not global (2)
    for (const event of gateEvents) {
      expect(event.maxIterations).toBe(3);
    }
  });

  it("standard loop step (no step override) emits global maxIterations", async () => {
    const events = new EventBus();
    const iterationStartEvents: Array<{ step: string; iteration: number; maxIterations: number }> = [];
    events.on("pipeline:iteration:start", (e) => {
      iterationStartEvents.push(e as { step: string; iteration: number; maxIterations: number });
    });

    const store = makeStore();
    const executor = makeApprovedExecutor(store);

    const reviewStep: AgentStep = {
      kind: "agent",
      name: "spec-review",
      agent: {} as never,
      completionVerdict: "approved",
      buildMessage: () => "review message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const pipeline = new Pipeline({
      steps: new Map([["spec-review", reviewStep]]),
      transitions: [
        { step: "spec-review", on: "approved", to: "end" },
        { step: "spec-review", on: "escalation", to: "escalate" },
        { step: "spec-review", on: "needs-fix", to: "end" },
        { step: "spec-review", on: "error", to: "escalate" },
      ],
      maxIterations: 5,
      maxIterationsByStep: { "regression-gate": 3 },  // no override for spec-review
      loopName: "spec-review",
      loopNames: ["spec-review"],
      executor: executor as never,
      events,
    });

    const state: JobState = { ...makeState(), step: "spec-review" };
    const deps = makeDeps(store);
    deps.storeFactory = () => store as never;

    await pipeline.run("spec-review", state, deps);

    const reviewEvents = iterationStartEvents.filter((e) => e.step === "spec-review");
    expect(reviewEvents.length).toBeGreaterThan(0);

    // spec-review has no step-specific override → uses global maxIterations (5)
    for (const event of reviewEvents) {
      expect(event.maxIterations).toBe(5);
    }
  });
});
