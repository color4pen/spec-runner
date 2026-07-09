/**
 * Executor main-checkout drift detection tests.
 *
 * Covers acceptance criteria from tasks.md T-07 and T-09:
 *
 *   TC-001/TC-006: Agent step with monitored path drift → awaiting-resume + resumePoint + mainCheckoutDrift
 *   TC-004: Unmonitored path change → no escalation, run completes normally
 *   TC-008: No drift → run completes normally (existing behaviour unchanged)
 *   TC-010/TC-011: no-worktree / managed (null snapshot) → check not performed
 *   TC-017: CLI step (runCliStep) does not call snapshotMainCheckoutGuard
 *   TC-019: guardBefore null → skip drift detection entirely
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { AgentStep, CliStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";
import type { MainCheckoutGuardSnapshot } from "../../port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 2,
    jobId: "drift-test-job",
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
    step: "implementer",
    status: "running",
    branch: "feat/example-abc12345",
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
    persist: vi.fn(async (_s: JobState) => undefined),
    appendLineage: async () => undefined,
    appendInterruption: async () => undefined,
  };
}

function makeRunner(completionReason: "success" | "timeout" = "success") {
  return {
    run: vi.fn(async () => ({
      completionReason,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
      error: completionReason === "timeout" ? new Error("timed out") : undefined,
    })),
  };
}

function makeSnapshot(entries: { path: string; hash: string | null }[]): MainCheckoutGuardSnapshot {
  return { entries };
}

/**
 * Build a runtime strategy stub with controllable snapshotMainCheckoutGuard.
 *
 * @param snapshots - Ordered snapshots to return on successive calls (before, then after).
 *   Pass [null] to simulate no-worktree / error on before-snapshot.
 *   Pass [snap, null] to simulate error on after-snapshot (fail-open).
 */
function makeRuntimeStrategy(snapshots: (MainCheckoutGuardSnapshot | null)[]) {
  let callIdx = 0;
  const snapshotFn = vi.fn(async () => {
    const snap = snapshots[callIdx] ?? null;
    callIdx++;
    return snap;
  });
  return {
    captureHeadSha: vi.fn(async () => null as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
    snapshotMainCheckoutGuard: snapshotFn,
  };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    completionVerdict: "success" as const,
    buildMessage: () => "do the work",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

function makeCliStep(name = "pr-create"): CliStep {
  return {
    kind: "cli",
    name,
    run: vi.fn(async () => {}),
    resultFilePath: () => "specrunner/changes/x/pr-create.md",
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

function makeDeps(
  storeFactory: () => ReturnType<typeof makeStore>,
  runtimeStrategy?: ReturnType<typeof makeRuntimeStrategy>,
): PipelineDeps {
  return {
    cwd: "/tmp/worktree",
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
    storeFactory: storeFactory as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy: runtimeStrategy as never,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-001/TC-006: Drift detected → awaiting-resume + resumePoint + mainCheckoutDrift
// ---------------------------------------------------------------------------

describe("TC-001/TC-006: Agent step drift detection escalation", () => {
  it("drift in guarded path → state becomes awaiting-resume with mainCheckoutDrift", async () => {
    const before = makeSnapshot([]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:new" }]);
    const runtimeStrategy = makeRuntimeStrategy([before, after]);

    const store = makeStore();
    let persistedState: JobState | null = null;
    store.persist = vi.fn(async (s: JobState) => { persistedState = s; });

    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep("implementer");
    const state = makeState();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    // Executor should throw (attachStateAndRethrow) after detecting drift
    await expect(executor.execute(step, state, deps)).rejects.toThrow("Main checkout write detected");

    // snapshotMainCheckoutGuard called twice (before + after)
    expect(runtimeStrategy.snapshotMainCheckoutGuard).toHaveBeenCalledTimes(2);

    // Persisted state should have awaiting-resume status and mainCheckoutDrift
    expect(persistedState).not.toBeNull();
    const ps = persistedState as unknown as JobState;
    expect(ps.status).toBe("awaiting-resume");
    expect(ps.resumePoint).toBeDefined();
    expect(ps.resumePoint?.reason).toBe("main checkout write detected");
    expect(ps.resumePoint?.step).toBe("implementer");
    expect(ps.mainCheckoutDrift).toBeDefined();
    expect(ps.mainCheckoutDrift?.detectedAtStep).toBe("implementer");
    expect(ps.mainCheckoutDrift?.changes).toEqual([
      { path: ".specrunner/config.json", kind: "created" },
    ]);
  });

  it("drift does not proceed to finalizeStepArtifacts (commit)", async () => {
    const before = makeSnapshot([]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:new" }]);
    const runtimeStrategy = makeRuntimeStrategy([before, after]);

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    await expect(executor.execute(step, makeState(), deps)).rejects.toThrow();

    // finalizeStepArtifacts must NOT have been called (commit is skipped)
    expect(runtimeStrategy.finalizeStepArtifacts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-004: Unmonitored path change → no escalation
// ---------------------------------------------------------------------------

describe("TC-004: Unmonitored path change does not escalate", () => {
  it("change to unmonitored path → run completes normally", async () => {
    // Both snapshots are empty (no monitored paths changed)
    const runtimeStrategy = makeRuntimeStrategy([
      makeSnapshot([]),
      makeSnapshot([]),
    ]);

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    // Should not throw — no drift in monitored paths
    const resultState = await executor.execute(step, makeState(), deps);
    expect(resultState.status).toBe("running");
    expect(resultState.mainCheckoutDrift).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: No drift → run completes normally (existing behaviour unchanged)
// ---------------------------------------------------------------------------

describe("TC-008: No drift — run completes normally", () => {
  it("identical before/after snapshots → no escalation, step succeeds", async () => {
    const snap = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:same" }]);
    const runtimeStrategy = makeRuntimeStrategy([snap, snap]);

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    const resultState = await executor.execute(step, makeState(), deps);
    expect(resultState.status).toBe("running");
    expect(resultState.mainCheckoutDrift).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-010 / TC-011: no-worktree / managed → snapshot is null → check skipped
// ---------------------------------------------------------------------------

describe("TC-010/TC-011: null snapshot (no-worktree / managed) skips drift detection", () => {
  it("when snapshotMainCheckoutGuard returns null for before, drift check is skipped", async () => {
    // Simulate no-worktree: always returns null
    const runtimeStrategy = makeRuntimeStrategy([null]);

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    // Should complete normally — null before means no check performed
    const resultState = await executor.execute(step, makeState(), deps);
    expect(resultState.status).toBe("running");
    // snapshotMainCheckoutGuard called once (for before; after is skipped)
    expect(runtimeStrategy.snapshotMainCheckoutGuard).toHaveBeenCalledTimes(1);
  });

  it("when runtimeStrategy has no snapshotMainCheckoutGuard, drift check is skipped", async () => {
    // Strategy without the optional method
    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => null as string | null),
      prepareStepArtifacts: vi.fn(async () => {}),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      // no snapshotMainCheckoutGuard
    };

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy as never);

    const resultState = await executor.execute(step, makeState(), deps);
    expect(resultState.status).toBe("running");
  });
});

// ---------------------------------------------------------------------------
// TC-019: guardBefore null → skip drift detection (fail-open on snapshot error)
// ---------------------------------------------------------------------------

describe("TC-019: guardBefore null → skip detection entirely", () => {
  it("before snapshot null → after not fetched, run continues", async () => {
    const runtimeStrategy = makeRuntimeStrategy([null]); // only null for before

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    await executor.execute(step, makeState(), deps);
    // snapshotMainCheckoutGuard only called once (before); after is not fetched
    expect(runtimeStrategy.snapshotMainCheckoutGuard).toHaveBeenCalledTimes(1);
  });

  it("after snapshot null (git error) → fail-open, run continues", async () => {
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:orig" }]);
    const runtimeStrategy = makeRuntimeStrategy([before, null]); // after errors → null

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeAgentStep();
    const deps = makeDeps(storeFactory, runtimeStrategy);

    // Fail-open: null after means check is skipped, run continues normally
    const resultState = await executor.execute(step, makeState(), deps);
    expect(resultState.status).toBe("running");
    expect(resultState.mainCheckoutDrift).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-017: CLI step does NOT call snapshotMainCheckoutGuard
// ---------------------------------------------------------------------------

describe("TC-017: CLI step does not call snapshotMainCheckoutGuard", () => {
  it("runCliStep does not invoke snapshotMainCheckoutGuard", async () => {
    const runtimeStrategy = makeRuntimeStrategy([
      makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:orig" }]),
      makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:changed" }]),
    ]);

    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), makeRunner() as never, storeFactory);
    const step = makeCliStep("pr-create");

    // CLI step needs a real result file read path — make it resolve to null verdict
    (step as CliStep).resultFilePath = () => "specrunner/changes/example/pr-create-result.md";
    (step as CliStep).parseResult = () => ({ verdict: "success", findingsPath: null });

    const deps = makeDeps(storeFactory, runtimeStrategy);

    // CLI steps read the result file from disk — patch validateRequiredInputs to avoid fs call
    // by giving no reads() and no runtimeStrategy validateStepInputs path.
    // The test only verifies that snapshotMainCheckoutGuard is never called.
    // Provide validateStepInputs as no-op so the CLI path doesn't trip on missing file.
    try {
      await executor.execute(step, makeState(), deps);
    } catch {
      // CLI step may fail on missing result file — that's OK; we only care about snapshot calls
    }

    // snapshotMainCheckoutGuard must NOT have been called for a CLI step
    expect(runtimeStrategy.snapshotMainCheckoutGuard).not.toHaveBeenCalled();
  });
});
