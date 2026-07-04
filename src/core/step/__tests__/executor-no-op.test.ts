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
 *
 * Also verifies requirements 1-4 from approved-fixer-noop-proceeds:
 * - Req 1: approved findings-routing path no-op is NOT escalated
 * - Req 2: needs-fix path no-op IS escalated (#734 regression guard)
 * - Req 3: approved path with source changes loops back (approved)
 * - Req 4: conformance-triggered no-op IS escalated (conformance is not findings-routing)
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

// ---------------------------------------------------------------------------
// Requirements 1-4: approved-fixer-noop-proceeds
// ---------------------------------------------------------------------------

import { STEP_NAMES } from "../step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../regression-gate.js";

/** Build a state that has a code-review run with the given verdict + findings. */
function makeStateWithCodeReview(
  verdict: string,
  findings: Array<{ severity: string; resolution: string }> = [],
): JobState {
  return {
    ...makeState(),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict,
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: findings.map((f) => ({
                severity: f.severity,
                resolution: f.resolution,
                file: "src/foo.ts",
                title: "T",
                rationale: "R",
              })),
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

describe("StepExecutor — approved-fixer-noop-proceeds requirements", () => {
  // ---------------------------------------------------------------------------
  // Requirement 1: approved findings-routing no-op does NOT escalate
  // ---------------------------------------------------------------------------
  it("Req 1: code-review approved + low fixable findings, no source changes → verdict stays 'approved' (not escalated)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",  // only artifact files
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review approved + low fixable finding → findings-routing path
    const state = makeStateWithCodeReview("approved", [
      { severity: "low", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // No mandatory findings → no-op is legitimate → verdict must stay "approved", not escalated
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // ---------------------------------------------------------------------------
  // Requirement 2: needs-fix path no-op IS escalated (#734 regression guard)
  // ---------------------------------------------------------------------------
  it("Req 2: code-review needs-fix, no source changes → verdict overridden to 'needs-fix' (escalated)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no changed files
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review needs-fix → fixer must work, no-op is a genuine failure
    const state = makeStateWithCodeReview("needs-fix", [
      { severity: "high", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // needs-fix path → no-op must be escalated
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  // ---------------------------------------------------------------------------
  // Requirement 3: approved path with source changes → approved (re-review loop)
  // ---------------------------------------------------------------------------
  it("Req 3: code-review approved + fixable findings, source files changed → verdict 'approved' (re-review)", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([
      "src/foo.ts",  // real source file changed
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    const state = makeStateWithCodeReview("approved", [
      { severity: "low", resolution: "fixable" },
    ]);
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // Source changed → no no-op → verdict stays "approved" (triggers re-review)
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  // ---------------------------------------------------------------------------
  // Requirement 4: conformance-triggered no-op IS escalated (not findings-routing)
  // ---------------------------------------------------------------------------
  it("Req 4: conformance needs-fix:code-fixer (after code-review approved+fixable), no source changes → escalated", async () => {
    const runner = makeRunner();
    const runtimeStrategy = makeRuntimeStrategy([]);  // no source changes
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);

    const step = makeStep(true);  // noOpDetect: true
    // State: code-review approved + fixable, BUT conformance ran later with needs-fix:code-fixer
    // → conformance is the trigger, not findings-routing → must escalate
    const state: JobState = {
      ...makeStateWithCodeReview("approved", [{ severity: "low", resolution: "fixable" }]),
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "low", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:05:00Z",
            endedAt: "2026-01-01T00:05:30Z",
            outcome: {
              verdict: "needs-fix:code-fixer",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "high", resolution: "fixable", file: "src/bar.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // conformance triggered this → codeReviewFindingsRoutingActive = false → escalate
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });
});
