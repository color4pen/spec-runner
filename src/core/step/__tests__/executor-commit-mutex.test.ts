/**
 * TC-035: commit mutex (commitMutex) serialization unit test.
 *
 * Design D3 (reviewer-parallel-execution): when multiple member steps execute in
 * parallel via Promise.allSettled, each one calls finalizeStepArtifacts (which runs
 * `git add -A && commit && push`). Running these concurrently causes `index.lock`
 * conflicts and state write races.
 *
 * This test verifies that the FIFO promise-chain mutex in StepExecutor ensures
 * finalizeStepArtifacts calls are never concurrent — 2nd call begins only after
 * 1st call completes.
 */
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "mutex-test-job",
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
    step: "code-review",
    status: "running",
    branch: "feat/example",
    history: [],
    error: null,
    steps: {},
  };
}

function makeStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeStore() {
  return {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
}

function makeRunner() {
  return {
    run: vi.fn(async () => ({
      completionReason: "success" as const,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
    })),
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const store = makeStore();
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
    ...overrides,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-035: concurrent execute() → finalizeStepArtifacts is serialized
// ---------------------------------------------------------------------------

describe("StepExecutor — TC-035: commitMutex serializes finalizeStepArtifacts", () => {
  it("concurrent execute() calls finalize steps serially — max 1 active finalize at a time", async () => {
    // Track concurrency
    let activeCount = 0;
    let maxConcurrent = 0;
    const callLog: string[] = [];

    const runner = makeRunner();

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => null as string | null),
      prepareStepArtifacts: vi.fn(async () => {}),
      finalizeStepArtifacts: vi.fn(async (step: unknown) => {
        const name = (step as { name: string }).name;
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        callLog.push(`start:${name}`);
        // Yield to the event loop to allow other concurrent operations to race in
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        callLog.push(`end:${name}`);
        activeCount--;
      }),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => [] as never[]),
    };

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const state = makeState();
    const deps = makeDeps({
      storeFactory,
      runtimeStrategy: runtimeStrategy as never,
    });

    // Launch both steps concurrently — this is the parallel fan-out pattern
    const results = await Promise.allSettled([
      executor.execute(makeStep("reviewer-A"), state, deps),
      executor.execute(makeStep("reviewer-B"), state, deps),
    ]);

    // Both steps must complete without error
    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }

    // finalizeStepArtifacts must have been called exactly twice (once per step)
    expect(runtimeStrategy.finalizeStepArtifacts).toHaveBeenCalledTimes(2);

    // The critical invariant: calls must never overlap (mutex enforces serialization)
    expect(maxConcurrent).toBe(1);

    // The call log must show a strictly sequential pattern:
    //   [start:X, end:X, start:Y, end:Y] or [start:Y, end:Y, start:X, end:X]
    expect(callLog).toHaveLength(4);
    // First call: start immediately followed by end for the same step
    const firstStep = callLog[0]!.replace("start:", "");
    expect(callLog[0]).toBe(`start:${firstStep}`);
    expect(callLog[1]).toBe(`end:${firstStep}`);
    // Second call: start only after first end
    const secondStep = callLog[2]!.replace("start:", "");
    expect(callLog[2]).toBe(`start:${secondStep}`);
    expect(callLog[3]).toBe(`end:${secondStep}`);
    // The two steps must be different
    expect(firstStep).not.toBe(secondStep);
  });

  it("single execute() path — finalizeStepArtifacts called exactly once (zero overhead)", async () => {
    const runner = makeRunner();
    const finalizeCalls: string[] = [];

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => null as string | null),
      prepareStepArtifacts: vi.fn(async () => {}),
      finalizeStepArtifacts: vi.fn(async (step: unknown) => {
        finalizeCalls.push((step as { name: string }).name);
      }),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => [] as never[]),
    };

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const state = makeState();
    const deps = makeDeps({
      storeFactory,
      runtimeStrategy: runtimeStrategy as never,
    });

    await executor.execute(makeStep("code-review"), state, deps);

    expect(runtimeStrategy.finalizeStepArtifacts).toHaveBeenCalledTimes(1);
    expect(finalizeCalls).toEqual(["code-review"]);
  });
});
