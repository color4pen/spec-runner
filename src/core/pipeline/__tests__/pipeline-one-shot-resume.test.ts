/**
 * Pipeline-level one-shot resume input distribution tests (D4, round-immutable-input).
 *
 * After T-02 removes in-place clearing from executor.ts, the one-shot ownership
 * is managed by Pipeline.runInternal via `firstUnitExecuted` and `depsWithoutResume`.
 *
 * Invariants:
 * - The first unit to execute receives the original deps (with resumePrompt/resumeContext).
 * - Subsequent units receive depsWithoutResume (resume input stripped).
 * - The shared deps object is never mutated.
 * - Non-resume runs: no step receives resume input (deps has no resume fields set).
 */

import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../pipeline.js";
import { EventBus } from "../../event/event-bus.js";
import type { Step } from "../../step/types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import type { ResumeContextSnapshot } from "../../resume/resume-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(startStep: string): JobState {
  return {
    version: 2,
    jobId: "pipeline-one-shot-test",
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
    step: startStep,
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

function makeAgentStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: {} as never,
    completionVerdict: "success" as const,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

function makeDeps(
  store: ReturnType<typeof makeStore>,
  overrides: Partial<PipelineDeps> = {},
): PipelineDeps {
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
    runtimeStrategy: undefined,
    resumePrompt: undefined,
    resumeContext: undefined,
    ...overrides,
  } as PipelineDeps;
}

/**
 * Fake executor that:
 * - Captures resumePrompt and resumeContext from deps at execute time.
 * - Returns a state with `verdict: "success"` for the executed step.
 */
function makeCapturingExecutor(): {
  executor: { execute: ReturnType<typeof vi.fn> };
  getCapturedResumePrompt: (stepName: string) => string | undefined;
  getCapturedResumeContext: (stepName: string) => ResumeContextSnapshot | undefined;
} {
  const capturedResumePrompts = new Map<string, string | undefined>();
  const capturedResumeContexts = new Map<string, ResumeContextSnapshot | undefined>();

  const execute = vi.fn(async (step: Step, state: JobState, deps: PipelineDeps): Promise<JobState> => {
    capturedResumePrompts.set(step.name, deps.resumePrompt);
    capturedResumeContexts.set(step.name, deps.resumeContext as ResumeContextSnapshot | undefined);

    const now = new Date().toISOString();
    const stepRun: StepRun = {
      attempt: (state.steps?.[step.name]?.length ?? 0) + 1,
      sessionId: null,
      startedAt: now,
      endedAt: now,
      outcome: { verdict: "success" as const, findingsPath: null, error: null },
    };
    return {
      ...state,
      steps: { ...(state.steps ?? {}), [step.name]: [stepRun] },
      updatedAt: now,
    };
  });

  return {
    executor: { execute },
    getCapturedResumePrompt: (name: string) => capturedResumePrompts.get(name),
    getCapturedResumeContext: (name: string) => capturedResumeContexts.get(name),
  };
}

/**
 * Build a minimal two-step linear pipeline (step-alpha → step-beta → end).
 */
function makeTwoStepPipeline(
  executor: { execute: ReturnType<typeof vi.fn> },
): Pipeline {
  const events = new EventBus();

  return new Pipeline({
    steps: new Map([
      ["step-alpha", makeAgentStep("step-alpha")],
      ["step-beta", makeAgentStep("step-beta")],
    ]),
    transitions: [
      { step: "step-alpha", on: "success", to: "step-beta" },
      { step: "step-beta", on: "success", to: "end" },
      { step: "step-alpha", on: "error", to: "escalate" },
      { step: "step-beta", on: "error", to: "escalate" },
    ],
    maxIterations: 3,
    loopName: "",
    executor: executor as never,
    events,
  });
}

// ---------------------------------------------------------------------------
// One-shot: human note reaches only the first step
// ---------------------------------------------------------------------------

describe("Pipeline one-shot — human resume note delivered only to the first step", () => {
  it("first step receives resumePrompt; subsequent steps do not", async () => {
    const RESUME_PROMPT = "operator guidance for this resume";

    const store = makeStore();
    const { executor, getCapturedResumePrompt } = makeCapturingExecutor();
    const pipeline = makeTwoStepPipeline(executor);

    const state = makeState("step-alpha");
    const deps = makeDeps(store, { resumePrompt: RESUME_PROMPT });

    await pipeline.run("step-alpha", state, deps);

    // First unit (step-alpha) receives the human note
    expect(getCapturedResumePrompt("step-alpha")).toBe(RESUME_PROMPT);
    // Second unit (step-beta) must NOT receive the human note
    expect(getCapturedResumePrompt("step-beta")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// One-shot: automatic context reaches only the first step
// ---------------------------------------------------------------------------

describe("Pipeline one-shot — automatic resume context delivered only to the first step", () => {
  it("first step receives resumeContext; subsequent steps do not", async () => {
    const RESUME_CONTEXT: ResumeContextSnapshot = {
      resumePoint: { step: "step-alpha", reason: "timeout", iterationsExhausted: 1 },
    };

    const store = makeStore();
    const { executor, getCapturedResumeContext } = makeCapturingExecutor();
    const pipeline = makeTwoStepPipeline(executor);

    const state = makeState("step-alpha");
    const deps = makeDeps(store, { resumeContext: RESUME_CONTEXT });

    await pipeline.run("step-alpha", state, deps);

    // First unit (step-alpha) receives resumeContext
    expect(getCapturedResumeContext("step-alpha")).toBe(RESUME_CONTEXT);
    // Second unit (step-beta) must NOT receive resumeContext
    expect(getCapturedResumeContext("step-beta")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// One-shot: shared deps object is not mutated
// ---------------------------------------------------------------------------

describe("Pipeline one-shot — shared deps object is not mutated", () => {
  it("deps.resumePrompt and deps.resumeContext retain original values after pipeline run", async () => {
    const RESUME_PROMPT = "operator note";
    const RESUME_CONTEXT: ResumeContextSnapshot = {
      resumePoint: { step: "step-alpha", reason: "escalation", iterationsExhausted: 0 },
    };

    const store = makeStore();
    const { executor } = makeCapturingExecutor();
    const pipeline = makeTwoStepPipeline(executor);

    const state = makeState("step-alpha");
    const deps = makeDeps(store, { resumePrompt: RESUME_PROMPT, resumeContext: RESUME_CONTEXT });

    await pipeline.run("step-alpha", state, deps);

    // The pipeline must not mutate the shared deps object
    expect(deps.resumePrompt).toBe(RESUME_PROMPT);
    expect(deps.resumeContext).toBe(RESUME_CONTEXT);
  });
});

// ---------------------------------------------------------------------------
// Non-resume run: no step receives resume input
// ---------------------------------------------------------------------------

describe("Pipeline one-shot — non-resume run: no step receives resume input", () => {
  it("no step receives resumePrompt or resumeContext when deps has no resume fields", async () => {
    const store = makeStore();
    const { executor, getCapturedResumePrompt, getCapturedResumeContext } = makeCapturingExecutor();
    const pipeline = makeTwoStepPipeline(executor);

    const state = makeState("step-alpha");
    // No resume input (normal fresh start)
    const deps = makeDeps(store);

    await pipeline.run("step-alpha", state, deps);

    // Neither step should have received resume input
    expect(getCapturedResumePrompt("step-alpha")).toBeUndefined();
    expect(getCapturedResumeContext("step-alpha")).toBeUndefined();
    expect(getCapturedResumePrompt("step-beta")).toBeUndefined();
    expect(getCapturedResumeContext("step-beta")).toBeUndefined();
  });
});
