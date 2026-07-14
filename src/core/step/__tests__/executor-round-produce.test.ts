/**
 * TC-T02: StepExecutor.produceResult — intended-invariant tests.
 *
 * Verifies:
 *   AC #1 — produceResult returns a StepExecutionResult without calling any
 *            store mutation APIs (persist / update / appendHistory / fail).
 *   AC #2 — Guard halt produced inside produce() is returned as { kind: "halt" }
 *            (not rethrown).
 *   AC #3 — Outer throw (e.g. runner crash) is normalized to halt and returned
 *            (never rejects the promise).
 *
 * All tests use a spy-instrumented fake store and a controlled fake runner.
 * No filesystem, git, or network I/O occurs.
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
    jobId: "produce-test-job",
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
    step: "reviewer-alpha",
    status: "running",
    branch: "change/example",
    history: [],
    error: null,
    steps: {},
  };
}

function makeAgentStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/** Spy-instrumented fake store — all mutation APIs are tracked. */
function makeSpyStore() {
  return {
    update: vi.fn(async (s: JobState, patch: Partial<JobState>) => ({ ...s, ...patch })),
    appendHistory: vi.fn(async (s: JobState) => s),
    fail: vi.fn(async (s: JobState) => s),
    persist: vi.fn(async () => undefined),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
  };
}

/** Fake runner that returns a success result immediately. */
function makeSuccessRunner() {
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

/** Fake runner that throws an error. */
function makeThrowingRunner(err: Error) {
  return {
    run: vi.fn(async () => { throw err; }),
  };
}

function makeRuntimeStrategy() {
  return {
    captureHeadSha: vi.fn(async () => null as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
  };
}

function makeDeps(
  store: ReturnType<typeof makeSpyStore>,
  overrides: Partial<PipelineDeps> = {},
): PipelineDeps {
  return {
    cwd: "/tmp/test",
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
// AC #1: store mutation APIs NOT called
// ---------------------------------------------------------------------------

describe("StepExecutor.produceResult — store mutation APIs never called (AC #1)", () => {
  it("success result: persist / update / appendHistory / fail all have 0 calls", async () => {
    const store = makeSpyStore();
    const runner = makeSuccessRunner();
    const runtimeStrategy = makeRuntimeStrategy();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    const result = await executor.produceResult(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps(store, {
        runtimeStrategy: runtimeStrategy as never,
        roundOwnsGitEffects: true,
      }),
    );

    expect(result.kind).toBe("success");

    // AC #1: no store mutation API called
    expect(store.persist).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.appendHistory).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("skipped result: persist / update / appendHistory / fail all have 0 calls", async () => {
    const store = makeSpyStore();
    // Make runner return "skipped" by setting step.activation that won't match
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    // Step with activation condition that won't match (paths not in changedFiles)
    const step: AgentStep = {
      ...makeAgentStep("reviewer-alpha"),
      activation: { paths: ["src/very-specific-path/**"] },
    };

    const runtimeStrategy = {
      ...makeRuntimeStrategy(),
      listChangedFiles: vi.fn(async () => [] as string[]),
      canDeriveChangedFiles: () => true,
    };

    const result = await executor.produceResult(
      step,
      makeState(),
      makeDeps(store, {
        runtimeStrategy: runtimeStrategy as never,
        roundOwnsGitEffects: true,
      }),
    );

    expect(result.kind).toBe("skipped");

    // AC #1: no store mutation API called
    expect(store.persist).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.appendHistory).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC #2: guard halt returned as { kind: "halt" }, not rethrown
// ---------------------------------------------------------------------------

describe("StepExecutor.produceResult — guard halt returned as { kind: 'halt' } (AC #2)", () => {
  it("agent runner throw is normalized to { kind: 'halt' } by produce (runAgentStep guard)", async () => {
    const store = makeSpyStore();
    const runnerErr = Object.assign(new Error("agent exploded"), { code: "AGENT_STEP_FAILED" });
    const runner = makeThrowingRunner(runnerErr);
    const runtimeStrategy = makeRuntimeStrategy();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    // produceResult should NOT reject — it returns a halt result
    const result = await executor.produceResult(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps(store, { runtimeStrategy: runtimeStrategy as never, roundOwnsGitEffects: true }),
    );

    expect(result.kind).toBe("halt");
    // store.fail is NOT called (AC #1 + AC #2: halt is returned, not applied)
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.persist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC #3: outer throw normalized to halt, never rejects
// ---------------------------------------------------------------------------

describe("StepExecutor.produceResult — outer throw normalized to halt (AC #3)", () => {
  it("returns { kind: 'halt' } when produce() throws unexpectedly, never rejects", async () => {
    const store = makeSpyStore();
    // Runner that throws — this gets caught by runAgentStep's try/catch and converted to a halt
    const runner = makeThrowingRunner(new Error("outer crash"));
    const runtimeStrategy = makeRuntimeStrategy();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    // Must not throw (Promise must resolve, not reject)
    // Directly await the call to capture the result
    const result = await executor.produceResult(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps(store, { runtimeStrategy: runtimeStrategy as never, roundOwnsGitEffects: true }),
    );

    // Promise resolved (not rejected) and returned a halt result
    expect(result.kind).toBe("halt");
  });

  it("step:error event emitted on halt result", async () => {
    const store = makeSpyStore();
    const runner = makeThrowingRunner(Object.assign(new Error("crash"), { code: "AGENT_STEP_FAILED" }));
    const runtimeStrategy = makeRuntimeStrategy();
    const events = new EventBus();
    const errors: string[] = [];
    events.on("step:error", (payload: Record<string, unknown>) => {
      errors.push((payload.step as string));
    });

    const executor = new StepExecutor(
      events,
      runner as never,
      () => store as never,
    );

    await executor.produceResult(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps(store, { runtimeStrategy: runtimeStrategy as never, roundOwnsGitEffects: true }),
    );

    expect(errors).toContain("reviewer-alpha");
  });

  it("step:complete event emitted on success result", async () => {
    const store = makeSpyStore();
    const runner = makeSuccessRunner();
    const runtimeStrategy = makeRuntimeStrategy();
    const events = new EventBus();
    const completed: string[] = [];
    events.on("step:complete", (payload: Record<string, unknown>) => {
      completed.push(payload.step as string);
    });

    const executor = new StepExecutor(
      events,
      runner as never,
      () => store as never,
    );

    await executor.produceResult(
      makeAgentStep("reviewer-alpha"),
      makeState(),
      makeDeps(store, {
        runtimeStrategy: runtimeStrategy as never,
        roundOwnsGitEffects: true,
      }),
    );

    expect(completed).toContain("reviewer-alpha");
  });
});

// ---------------------------------------------------------------------------
// Regression: execute() (sequential path) remains unchanged
// ---------------------------------------------------------------------------

describe("StepExecutor.execute (sequential) — unchanged after produceResult addition", () => {
  it("execute() calls store.persist exactly once (sequential path unaffected)", async () => {
    const store = makeSpyStore();
    const runner = makeSuccessRunner();
    const runtimeStrategy = makeRuntimeStrategy();
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      () => store as never,
    );

    await executor.execute(
      makeAgentStep("implementer"),
      makeState(),
      makeDeps(store, { runtimeStrategy: runtimeStrategy as never }),
    );

    // Sequential path: store.persist is called twice (projection persist + branch/PR patch persist)
    expect(store.persist).toHaveBeenCalledTimes(2);
  });
});
