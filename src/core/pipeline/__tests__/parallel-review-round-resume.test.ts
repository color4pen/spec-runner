/**
 * Intended-invariant scenarios for ParallelReviewRound resume input distribution.
 *
 * TDD: these tests are written before T-02/T-03 implementation.
 * They are RED before implementation and GREEN after T-02+T-03 are applied.
 *
 * Key invariants verified:
 * D1 — shared deps (orchestration input) are not in-place mutated by the round.
 * D2 — human resume note is distributed to ALL pending members (readonly broadcast).
 * D3 — automatic resume context is distributed ONLY to the target member
 *       (the one whose step matches resumePoint.step).
 * D4 — execution order does not affect distribution (symmetry assertion).
 */

import { describe, it, expect } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { ParallelReviewRound } from "../parallel-review-round.js";
import type { ParallelReviewConfig } from "../types.js";
import type { Step } from "../../step/types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepExecutor } from "../../step/executor.js";
import type { StepExecutionResult } from "../../step/commit-orchestrator.js";
import type { ResumeContextSnapshot } from "../../resume/resume-context.js";
import { buildResumePrompt } from "../../resume/resume-context.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEMBER_A = "reviewer-alpha";
const MEMBER_B = "reviewer-beta";
const COORDINATOR = "custom-reviewers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

function makeApprovedResult(): StepExecutionResult {
  return {
    kind: "success",
    completion: { verdict: "approved", persistToolResult: null },
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    session: null,
  };
}

function makeState(): JobState {
  return {
    version: 2,
    jobId: "test-job-parallel-resume",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch: "change/test",
    history: [],
    error: null,
    steps: {},
    reviewers: [
      { name: MEMBER_A, maxIterations: 3, purpose: "", criteria: "", judgment: "", freeText: "" },
      { name: MEMBER_B, maxIterations: 3, purpose: "", criteria: "", judgment: "", freeText: "" },
    ],
  };
}

function makeStore() {
  return {
    persist: async () => undefined,
    update: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    appendHistory: async (state: JobState) => state,
    appendLineage: async () => undefined,
    appendInterruption: async (state: JobState) => state,
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cwd: "/tmp/test",
    slug: "test-slug",
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "...",
      adr: false,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "test",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => makeStore() as never,
    runtimeStrategy: {
      captureHeadSha: async () => "abc123",
      listChangedFiles: async () => ({ kind: "success" as const, files: [] }),
      finalizeStepArtifacts: async () => undefined,
      validateStepInputs: async () => undefined,
      validateStepOutputs: async () => ({ violations: [] }),
    } as never,
    ...overrides,
  };
}

/** Create a ParallelReviewRound with the given fake executor. */
function makeRound(fakeExecutor: StepExecutor): ParallelReviewRound {
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: [MEMBER_A, MEMBER_B],
  };
  const steps = new Map<string, Step>([
    [MEMBER_A, makeStep(MEMBER_A)],
    [MEMBER_B, makeStep(MEMBER_B)],
  ]);
  return new ParallelReviewRound({ executor: fakeExecutor, steps, parallelReview, events: new EventBus() });
}

/**
 * Fake executor that:
 * - Captures deps and effective resume prompt at produceResult time (via buildResumePrompt).
 * - Simulates the CURRENT in-place clearing behavior ONLY when it receives the
 *   original orchestration deps (same reference === check).
 *
 * RED/GREEN contract:
 *   - Before T-04: round.run passes the shared `deps` object to all members
 *     → `deps === orchestrationDeps` is true → clearing fires → second member loses input
 *   - After T-04: round.run creates `roundDeps = { ...deps }` and passes that
 *     → `roundDeps !== orchestrationDeps` → clearing does NOT fire → all members retain input
 */
function makeCapturingFakeExecutor(orchestrationDeps: PipelineDeps): {
  executor: StepExecutor;
  getCapturedDeps: (memberName: string) => PipelineDeps | undefined;
  getCapturedPrompt: (memberName: string) => string | undefined;
} {
  const capturedDepsMap = new Map<string, PipelineDeps>();
  const capturedPrompts = new Map<string, string | undefined>();

  const executor = {
    produceResult: async (step: Step, state: JobState, deps: PipelineDeps): Promise<StepExecutionResult> => {
      // Capture effective prompt BEFORE any mutation (mirrors buildStepContext behavior)
      const prompt = buildResumePrompt({
        state,
        stepName: step.name,
        resumeContext: deps.resumeContext,
        humanResumePrompt: deps.resumePrompt,
      });
      capturedDepsMap.set(step.name, deps);
      capturedPrompts.set(step.name, prompt);

      // Simulate the CURRENT executor's in-place clearing.
      // This fires only when receiving the shared orchestration deps (before T-04).
      // After T-04, roundDeps (a clone) is passed, so this condition is false.
      if (deps === orchestrationDeps) {
        deps.resumePrompt = undefined;
        deps.resumeContext = undefined;
      }

      // Return an approved StepExecutionResult (no state mutation)
      return makeApprovedResult();
    },
  } as unknown as StepExecutor;

  return {
    executor,
    getCapturedDeps: (name: string) => capturedDepsMap.get(name),
    getCapturedPrompt: (name: string) => capturedPrompts.get(name),
  };
}

// ---------------------------------------------------------------------------
// Scenario: shared deps unchanged after a parallel round
// ---------------------------------------------------------------------------

describe("ParallelReviewRound resume — shared deps unchanged after a parallel round (D1)", () => {
  it("shared deps.resumePrompt is not cleared after the round completes", async () => {
    const RESUME_PROMPT = "human operator note";
    const RESUME_CONTEXT: ResumeContextSnapshot = {
      resumePoint: { step: MEMBER_A, reason: "timeout", iterationsExhausted: 1 },
    };

    const deps = makeDeps({ resumePrompt: RESUME_PROMPT, resumeContext: RESUME_CONTEXT });
    const state = makeState();
    const { executor } = makeCapturingFakeExecutor(deps);
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, deps);

    // D1: orchestration input must remain unchanged after the round
    expect(deps.resumePrompt).toBe(RESUME_PROMPT);
    expect(deps.resumeContext).toBe(RESUME_CONTEXT);
  });
});

// ---------------------------------------------------------------------------
// Scenario: human note distributed to all pending members
// ---------------------------------------------------------------------------

describe("ParallelReviewRound resume — human note distributed to all pending members (D2)", () => {
  it("both pending members receive the human resume note", async () => {
    const RESUME_PROMPT = "human operator note";

    const deps = makeDeps({ resumePrompt: RESUME_PROMPT });
    const state = makeState();
    const { executor, getCapturedPrompt } = makeCapturingFakeExecutor(deps);
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, deps);

    // D2: human note must reach ALL pending members
    expect(getCapturedPrompt(MEMBER_A)).toContain(RESUME_PROMPT);
    expect(getCapturedPrompt(MEMBER_B)).toContain(RESUME_PROMPT);
  });
});

// ---------------------------------------------------------------------------
// Scenario: automatic context only for the target member
// ---------------------------------------------------------------------------

describe("ParallelReviewRound resume — automatic context only for the target member (D3)", () => {
  it("automatic resume context appears only in the target member's prompt", async () => {
    // resumeContext.resumePoint.step === MEMBER_A → A is the target
    const RESUME_CONTEXT: ResumeContextSnapshot = {
      resumePoint: { step: MEMBER_A, reason: "timeout", iterationsExhausted: 1 },
    };

    const deps = makeDeps({ resumeContext: RESUME_CONTEXT });
    const state = makeState();
    const { executor, getCapturedPrompt } = makeCapturingFakeExecutor(deps);
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, deps);

    // D3: automatic context block must be present for MEMBER_A (target)
    expect(getCapturedPrompt(MEMBER_A)).toContain("## Automatic resume context");
    // D3: automatic context block must NOT be present for MEMBER_B (non-target).
    // Use nullish coalescing so the assertion handles undefined (no prompt) as "absent".
    expect(getCapturedPrompt(MEMBER_B) ?? "").not.toContain("## Automatic resume context");
  });
});

// ---------------------------------------------------------------------------
// Scenario: human note reaches non-target members without automatic context
// ---------------------------------------------------------------------------

describe("ParallelReviewRound resume — human note reaches non-target members (D2+D3)", () => {
  it("non-target member receives human note but no automatic context", async () => {
    const RESUME_PROMPT = "human operator note";
    const RESUME_CONTEXT: ResumeContextSnapshot = {
      resumePoint: { step: MEMBER_A, reason: "timeout", iterationsExhausted: 1 },
    };

    const deps = makeDeps({ resumePrompt: RESUME_PROMPT, resumeContext: RESUME_CONTEXT });
    const state = makeState();
    const { executor, getCapturedPrompt } = makeCapturingFakeExecutor(deps);
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, deps);

    // MEMBER_B (non-target): human note present, automatic context absent
    const memberBPrompt = getCapturedPrompt(MEMBER_B);
    expect(memberBPrompt).toContain(RESUME_PROMPT);
    // Use nullish coalescing so the assertion handles undefined (no prompt) as "absent"
    expect(memberBPrompt ?? "").not.toContain("## Automatic resume context");
  });
});

// ---------------------------------------------------------------------------
// Scenario: execution order independence (symmetry)
// ---------------------------------------------------------------------------

describe("ParallelReviewRound resume — execution order independence (D4)", () => {
  it("human note presence is symmetric across all pending members", async () => {
    const RESUME_PROMPT = "human operator note";

    const deps = makeDeps({ resumePrompt: RESUME_PROMPT });
    const state = makeState();
    const { executor, getCapturedPrompt } = makeCapturingFakeExecutor(deps);
    const round = makeRound(executor);

    await round.run(COORDINATOR, state, deps);

    // D4: which member executes first must not affect whether human note is received
    const aHasNote = getCapturedPrompt(MEMBER_A)?.includes(RESUME_PROMPT) ?? false;
    const bHasNote = getCapturedPrompt(MEMBER_B)?.includes(RESUME_PROMPT) ?? false;

    // Both members must receive the human note (not order-dependent)
    expect(aHasNote).toBe(true);
    expect(bHasNote).toBe(true);
    // Symmetric: same presence for both
    expect(aHasNote).toBe(bHasNote);
  });
});
