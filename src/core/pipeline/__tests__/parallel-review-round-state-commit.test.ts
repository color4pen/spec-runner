/**
 * Intended-invariant tests for ParallelReviewRound state commit ownership (T-05).
 *
 * Acceptance criteria (round-owned-state-commit):
 *   AC #1 — member execution does not call store.persist (produceResult, no persist).
 *   AC #2 — coordinator calls CommitOrchestrator.commitRound which calls store.persist
 *            exactly once per round.
 *   AC #3 — no intermediate ("partial projection") state is written between members;
 *            the single persist always contains all member results.
 *   AC #4 — round verdict / reviewer status results match the pre-change behavior.
 *
 * All tests use a fake executor (produceResult) and a spy-instrumented store.
 * No filesystem, git, or network I/O occurs.
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../event/event-bus.js";
import { ParallelReviewRound } from "../parallel-review-round.js";
import type { ParallelReviewConfig } from "../types.js";
import type { Step } from "../../step/types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepExecutor } from "../../step/executor.js";
import type { StepExecutionResult } from "../../step/commit-orchestrator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COORDINATOR = "custom-reviewers";
const MEMBER_A = "reviewer-alpha";
const MEMBER_B = "reviewer-beta";

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

function makeState(): JobState {
  return {
    version: 2,
    jobId: "state-commit-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "specrunner/changes/test/request.md", title: "Test", type: "bug-fix" },
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

/** Spy-instrumented fake store. persist is a counter spy. */
function makeSpyStore() {
  const persistedStates: JobState[] = [];
  return {
    persist: vi.fn(async (s: JobState) => { persistedStates.push(s); }),
    update: vi.fn(async (s: JobState, p: Partial<JobState>) => ({ ...s, ...p })),
    fail: vi.fn(async (s: JobState) => ({ ...s, status: "failed" })),
    appendHistory: vi.fn(async (s: JobState) => s),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
    // Expose captured states for assertion
    _captured: persistedStates,
  };
}

/** Build a fake executor that returns controlled StepExecutionResults. */
function makeProduceFakeExecutor(
  verdicts: Map<string, "approved" | "needs-fix" | "escalation" | "skipped">,
  capturedFlags?: Map<string, boolean | undefined>,
): StepExecutor {
  return {
    produceResult: vi.fn(async (step: Step, _state: JobState, deps: PipelineDeps): Promise<StepExecutionResult> => {
      if (capturedFlags) {
        capturedFlags.set(step.name, deps.roundOwnsGitEffects);
      }
      const verdict = verdicts.get(step.name) ?? "approved";
      if (verdict === "skipped") {
        return { kind: "skipped", skipReason: "activation-not-matched" };
      }
      return {
        kind: "success",
        completion: { verdict, persistToolResult: null },
        completedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        session: null,
      };
    }),
  } as unknown as StepExecutor;
}

/** Build a fake executor that returns a halt for MEMBER_A and success for MEMBER_B. */
function makeHaltFakeExecutor(): StepExecutor {
  return {
    produceResult: vi.fn(async (step: Step): Promise<StepExecutionResult> => {
      if (step.name === MEMBER_A) {
        return {
          kind: "halt",
          halt: {
            kind: "failed",
            error: { code: "AGENT_STEP_FAILED", message: "member halted", hint: "" },
            thrownErr: new Error("member halted"),
          },
        };
      }
      return {
        kind: "success",
        completion: { verdict: "approved", persistToolResult: null },
        completedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        session: null,
      };
    }),
  } as unknown as StepExecutor;
}

function makeRound(fakeExecutor: StepExecutor): ParallelReviewRound {
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: [MEMBER_A, MEMBER_B],
  };
  const steps = new Map<string, Step>([
    [MEMBER_A, makeStep(MEMBER_A)],
    [MEMBER_B, makeStep(MEMBER_B)],
  ]);
  return new ParallelReviewRound({
    executor: fakeExecutor,
    steps,
    parallelReview,
    events: new EventBus(),
  });
}

function makeDeps(store: ReturnType<typeof makeSpyStore>, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cwd: "/tmp/test",
    slug: "test",
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test",
      baseBranch: "main",
      content: "...",
      adr: false,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "test",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => store as never,
    runtimeStrategy: {
      captureHeadSha: async () => "sha123",
      listChangedFiles: async () => ({ kind: "success" as const, files: [] }),
      finalizeStepArtifacts: async () => undefined,
      validateStepInputs: async () => undefined,
      validateStepOutputs: async () => ({ violations: [] }),
    } as never,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC #1 + #2: member no-persist, coordinator single persist
// ---------------------------------------------------------------------------

describe("ParallelReviewRound state commit — single persist per round (AC #1 / AC #2)", () => {
  it("store.persist is called exactly once for a 2-member fan-out round", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "needs-fix" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    await round.run(COORDINATOR, makeState(), makeDeps(store));

    expect(store.persist).toHaveBeenCalledTimes(1);
  });

  it("store.persist is called exactly once for the all-approved fast path (empty members)", async () => {
    const store = makeSpyStore();
    // State already has both members approved → pending = []
    const stateWithApproved: JobState = {
      ...makeState(),
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: "sha1", activationPaths: undefined, invalidatedByCommit: null },
        { name: MEMBER_B, status: "approved", approvedAtCommit: "sha1", activationPaths: undefined, invalidatedByCommit: null },
      ],
    };
    const executor = makeProduceFakeExecutor(new Map());
    const round = makeRound(executor);

    await round.run(COORDINATOR, stateWithApproved, makeDeps(store, { runtimeStrategy: undefined }));

    expect(store.persist).toHaveBeenCalledTimes(1);
    // produceResult NOT called (fast path, no pending members)
    expect((executor.produceResult as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC #3: no partial projection — persist argument always has all member results
// ---------------------------------------------------------------------------

describe("ParallelReviewRound state commit — no partial projection on persist (AC #3)", () => {
  it("persisted state contains both member StepRuns (not just first or last member)", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "needs-fix" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    await round.run(COORDINATOR, makeState(), makeDeps(store));

    // Only one persist call — capture its argument
    expect(store.persist).toHaveBeenCalledTimes(1);
    const persistedState = store.persist.mock.calls[0]?.[0] as JobState;

    // Both member StepRuns present in the persisted state (no partial projection)
    expect(persistedState.steps?.[MEMBER_A]).toBeDefined();
    expect(persistedState.steps?.[MEMBER_A]).toHaveLength(1);
    expect(persistedState.steps?.[MEMBER_B]).toBeDefined();
    expect(persistedState.steps?.[MEMBER_B]).toHaveLength(1);

    // Coordinator StepRun also present
    expect(persistedState.steps?.[COORDINATOR]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC #4: round verdict / reviewer status consistent with previous behavior
// ---------------------------------------------------------------------------

describe("ParallelReviewRound state commit — verdict / reviewer status (AC #4)", () => {
  it("approved + needs-fix members → aggregate needs-fix", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "needs-fix" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, makeState(), makeDeps(store));
    expect(outcome).toBe("needs-fix");
  });

  it("both approved → aggregate approved", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "approved" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, makeState(), makeDeps(store));
    expect(outcome).toBe("approved");
  });

  it("any escalation → aggregate escalation", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "escalation" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    const { outcome } = await round.run(COORDINATOR, makeState(), makeDeps(store));
    expect(outcome).toBe("escalation");
  });

  it("approved + needs-fix → reviewerStatuses: alpha=approved, beta=pending", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "needs-fix" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    const { state } = await round.run(COORDINATOR, makeState(), makeDeps(store));

    const alphaStatus = state.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    const betaStatus = state.reviewerStatuses?.find((s) => s.name === MEMBER_B);
    expect(alphaStatus?.status).toBe("approved");
    expect(betaStatus?.status).toBe("pending");
  });

  it("coordinator StepRun verdict matches aggregate outcome", async () => {
    const store = makeSpyStore();
    const verdicts = new Map([
      [MEMBER_A, "needs-fix" as const],
      [MEMBER_B, "needs-fix" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts);
    const round = makeRound(executor);

    const { state, outcome } = await round.run(COORDINATOR, makeState(), makeDeps(store));
    const coordinatorRuns = state.steps?.[COORDINATOR] ?? [];
    const lastRun = coordinatorRuns[coordinatorRuns.length - 1];

    expect(outcome).toBe("needs-fix");
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// member halt: job not failed, round outcome escalation
// ---------------------------------------------------------------------------

describe("ParallelReviewRound state commit — member halt (AC #3 / AC #4)", () => {
  it("member halt → aggregate escalation, job status NOT failed", async () => {
    const store = makeSpyStore();
    const executor = makeHaltFakeExecutor();
    const round = makeRound(executor);

    const { outcome, state } = await round.run(COORDINATOR, makeState(), makeDeps(store));

    // Aggregate escalation (MEMBER_A halted → escalation)
    expect(outcome).toBe("escalation");
    // Job status must NOT be "failed" (member halt does not transition job lifecycle)
    expect(state.status).not.toBe("failed");
    // store.fail NOT called
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("member halt: persist still called exactly once with all member results", async () => {
    const store = makeSpyStore();
    const executor = makeHaltFakeExecutor();
    const round = makeRound(executor);

    await round.run(COORDINATOR, makeState(), makeDeps(store));

    expect(store.persist).toHaveBeenCalledTimes(1);
    const persistedState = store.persist.mock.calls[0]?.[0] as JobState;
    // Both members present in persisted state
    expect(persistedState.steps?.[MEMBER_A]).toBeDefined();
    expect(persistedState.steps?.[MEMBER_B]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// roundOwnsGitEffects passed to members via produceResult
// ---------------------------------------------------------------------------

describe("ParallelReviewRound state commit — members receive roundOwnsGitEffects=true", () => {
  it("all pending members receive roundOwnsGitEffects === true in produceResult", async () => {
    const store = makeSpyStore();
    const capturedFlags = new Map<string, boolean | undefined>();
    const verdicts = new Map([
      [MEMBER_A, "approved" as const],
      [MEMBER_B, "approved" as const],
    ]);
    const executor = makeProduceFakeExecutor(verdicts, capturedFlags);
    const round = makeRound(executor);

    await round.run(COORDINATOR, makeState(), makeDeps(store));

    expect(capturedFlags.get(MEMBER_A)).toBe(true);
    expect(capturedFlags.get(MEMBER_B)).toBe(true);
  });
});
