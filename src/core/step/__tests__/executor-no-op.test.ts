/**
 * T-03: code-fixer no-op detection.
 *
 * Verifies that StepExecutor overrides verdict to "needs-fix" when:
 * - step.noOpDetect === true
 * - runtimeStrategy is available
 * - headBeforeStep is non-null
 * - completionReason === "success"
 * - listChangedFiles returns only pipeline artifacts (or nothing)
 *
 * And does NOT override when source files were changed.
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
    jobId: "no-op-test-job",
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
    step: "code-fixer",
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
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
}

function makeRunner() {
  // runner.run always succeeds; listChangedFiles is mocked separately in makeRuntimeStrategy
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

function makeRuntimeStrategy(changedFiles: string[]) {
  return {
    captureHeadSha: vi.fn(async () => "abc123head" as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => [] as never[]),
    listChangedFiles: vi.fn(async () => changedFiles),
  };
}

function makeStep(noOpDetect?: boolean): AgentStep {
  return {
    kind: "agent",
    name: "code-fixer",
    agent: { id: "code-fixer-agent" } as never,
    completionVerdict: "approved" as const,
    noOpDetect,
    buildMessage: () => "fix the code",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeDeps(runtimeStrategy?: ReturnType<typeof makeRuntimeStrategy>): PipelineDeps {
  const store = makeStore();
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
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy: runtimeStrategy as never,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StepExecutor — T-03: no-op detection", () => {
  it("no source files changed → verdict overridden to 'needs-fix'", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no changed files
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    // listChangedFiles must have been called with headBeforeStep
    expect(runtimeStrategy.listChangedFiles).toHaveBeenCalledWith(
      "abc123head",
      "/tmp/worktree",
      "feat/example-abc12345",
    );

    // Verdict must be overridden to needs-fix
    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  it("only artifact files changed → verdict overridden to 'needs-fix' (artifacts don't count as source)", async () => {
    const runner = makeRunner();
    // Files that look like artifact files only
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "specrunner/changes/example/events.jsonl",
      ".specrunner/local/example/liveness.json",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  it("source files changed → verdict stays 'approved' (no override)", async () => {
    const runner = makeRunner();
    // Mix of source and artifact files → source change present
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "src/core/step/executor.ts",  // source file
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("noOpDetect: false → listChangedFiles not called, verdict not overridden", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(false);  // noOpDetect: false
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("noOpDetect: undefined → listChangedFiles not called, verdict not overridden", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(undefined);  // noOpDetect: undefined
    const state = makeState();
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("runtimeStrategy absent → no-op detection does not activate", async () => {
    const runner = makeRunner();
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    const state = makeState();
    const deps = makeDeps(undefined);  // no runtimeStrategy
    deps.storeFactory = storeFactory;

    // Should not throw and should produce approved (no listChangedFiles call)
    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // Without runtimeStrategy, headBeforeStep is null → no-op detection skipped → approved
    expect(lastRun?.outcome.verdict).toBe("approved");
  });
});
