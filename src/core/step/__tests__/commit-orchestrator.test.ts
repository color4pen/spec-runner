/**
 * TC-015: CommitOrchestrator — single-writer ownership tests.
 *
 * Verifies:
 *   - Success path: store.persist is called by CommitOrchestrator (not executor).
 *   - Halt (failed): store.fail → store.persist → attachStateAndRethrow throw.
 *   - Halt (awaiting-resume): transitionJob + appendInterruption + optional history
 *     + store.persist → throw.
 *   - apply: dispatches to commitSuccess / commitSkipped / commitHalt based on
 *     result.kind.
 *
 * B-13: state persistence APIs are called only inside CommitOrchestrator.
 * B-14: transitionJob / attachStateAndRethrow are called only inside CommitOrchestrator.
 */

import { describe, it, expect, vi } from "vitest";
import { CommitOrchestrator } from "../commit-orchestrator.js";
import { EventBus } from "../../event/event-bus.js";
import type { Step, AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { StepCompletion } from "../step-completion.js";
import type { StepExecutionResult } from "../commit-orchestrator.js";
import {
  makeAgentThrowHalt,
  makeTimeoutHalt,
} from "../step-halt.js";
import type { Verdict } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "co-test-job",
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
    step: "spec-review",
    status: "running",
    branch: "feat/example",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeAgentStep(name = "spec-review"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: (_state: JobState, _deps: PipelineDeps) => `/tmp/${name}-findings.md`,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeStep(name = "spec-review"): Step {
  return makeAgentStep(name);
}

interface StoreMock {
  update: ReturnType<typeof vi.fn>;
  appendHistory: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  appendLineage: ReturnType<typeof vi.fn>;
  appendInterruption: ReturnType<typeof vi.fn>;
}

function makeStoreMock(): StoreMock {
  return {
    update: vi.fn(async (s: JobState, patch: Partial<JobState>) => ({ ...s, ...patch })),
    appendHistory: vi.fn(async (s: JobState) => s),
    fail: vi.fn(async (s: JobState) => ({ ...s, status: "failed" })),
    persist: vi.fn(async () => undefined),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async () => undefined),
  };
}

function makeStoreFactory(mock: StoreMock) {
  return (_jobId: string) => mock as never;
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
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
    storeFactory: () => ({} as never),
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    ...overrides,
  } as PipelineDeps;
}

function makeCompletion(verdict: Verdict = "approved"): StepCompletion {
  return {
    verdict,
    persistToolResult: null,
  };
}

function makeSuccessResult(completion: StepCompletion = makeCompletion()): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion,
    completedAt: "2026-01-01T00:01:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    session: null,
  };
}

// ---------------------------------------------------------------------------
// TC-015-A: begin
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — begin", () => {
  it("agent step: appends {step}-started history entry and sets state.step", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeAgentStep("spec-review");
    const state = makeState();

    await orchestrator.begin(step, state);

    // store.update called to set step name
    expect(store.update).toHaveBeenCalledOnce();
    expect(store.update.mock.calls[0]?.[1]).toMatchObject({ step: "spec-review" });

    // appendHistory called with spec-review-started entry
    expect(store.appendHistory).toHaveBeenCalledOnce();
    const historyArg = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(historyArg.step).toBe("spec-review-started");
    expect(historyArg.status).toBe("started");
  });

  it("cli step: appends step-transition history entry", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step: Step = {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => "/tmp/verification-result.md",
      parseResult: () => ({ verdict: null, findingsPath: null }),
    } as never;
    const state = makeState();

    await orchestrator.begin(step, state);

    expect(store.appendHistory).toHaveBeenCalledOnce();
    const historyArg = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(historyArg.step).toBe("step-transition");
    expect(historyArg.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// TC-015-B: commitSuccess
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — commitSuccess (TC-015-B)", () => {
  it("calls store.persist and emits verdict:parsed", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const emitted: Array<{ step: string; verdict: string }> = [];
    events.on("verdict:parsed", (payload: Record<string, unknown>) => {
      emitted.push({ step: payload.step as string, verdict: (payload.outcome as Record<string, unknown>).verdict as string });
    });

    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });
    const result = makeSuccessResult();

    await orchestrator.commitSuccess(step, state, deps, result);

    // persist is called
    expect(store.persist).toHaveBeenCalledOnce();
    // appendHistory called for verdict entry
    expect(store.appendHistory).toHaveBeenCalledOnce();
    const histEntry = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(histEntry.step).toBe("spec-review-verdict");
    // event emitted
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.step).toBe("spec-review");
    expect(emitted[0]?.verdict).toBe("approved");
  });

  it("store.fail and transitionJob are NOT called on success path", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    await orchestrator.commitSuccess(step, state, deps, makeSuccessResult());

    expect(store.fail).not.toHaveBeenCalled();
    expect(store.appendInterruption).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-015-C: commitHalt — failed
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — commitHalt (failed) (TC-015-C)", () => {
  it("calls store.fail, then store.persist, then throws", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();

    const err = Object.assign(new Error("agent exploded"), { code: "AGENT_STEP_FAILED" });
    const halt = makeAgentThrowHalt(err, "spec-review");

    await expect(orchestrator.commitHalt(step, state, halt)).rejects.toThrow("agent exploded");

    // store.fail called before persist
    expect(store.fail).toHaveBeenCalledOnce();
    expect(store.persist).toHaveBeenCalledOnce();
    // history entry appended (makeAgentThrowHalt sets history)
    expect(store.appendHistory).toHaveBeenCalledOnce();
    const histEntry = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(histEntry.step).toBe("spec-review-failed");
    // appendInterruption NOT called (kind: "failed")
    expect(store.appendInterruption).not.toHaveBeenCalled();
  });

  it("rethrows the original error with state attached", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();

    const original = Object.assign(new Error("sentinel error"), { code: "AGENT_STEP_FAILED" });
    const halt = makeAgentThrowHalt(original, "spec-review");

    let caughtErr: Error & { state?: JobState } | undefined;
    try {
      await orchestrator.commitHalt(step, state, halt);
    } catch (e) {
      caughtErr = e as Error & { state?: JobState };
    }

    expect(caughtErr?.message).toBe("sentinel error");
    expect(caughtErr?.state).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-015-D: commitHalt — awaiting-resume
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — commitHalt (awaiting-resume) (TC-015-D)", () => {
  it("calls appendInterruption and persist but NOT store.fail, then throws", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();

    // makeTimeoutHalt produces awaiting-resume halt
    const runResult = { error: Object.assign(new Error("poll timed out"), { code: "POLL_TIMEOUT" }) };
    const halt = makeTimeoutHalt(runResult, "spec-review");
    expect(halt.kind).toBe("awaiting-resume");

    await expect(orchestrator.commitHalt(step, state, halt)).rejects.toThrow("poll timed out");

    // store.fail NOT called (awaiting-resume path uses transitionJob)
    expect(store.fail).not.toHaveBeenCalled();
    // appendInterruption called
    expect(store.appendInterruption).toHaveBeenCalledOnce();
    const interruptionArg = store.appendInterruption.mock.calls[0]?.[0] as Record<string, string>;
    expect(interruptionArg.type).toBe("interruption");
    expect(interruptionArg.reason).toBe("timeout");
    // persist called
    expect(store.persist).toHaveBeenCalledOnce();
    // history entry appended (makeTimeoutHalt sets history)
    expect(store.appendHistory).toHaveBeenCalledOnce();
    const histEntry = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(histEntry.step).toBe("spec-review-timeout");
  });
});

// ---------------------------------------------------------------------------
// TC-015-E: commitSkipped
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — commitSkipped (TC-015-E)", () => {
  it("persists skipped result and emits verdict:parsed with 'skipped'", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const emitted: Array<{ step: string; verdict: string }> = [];
    events.on("verdict:parsed", (payload: Record<string, unknown>) => {
      emitted.push({ step: payload.step as string, verdict: (payload.outcome as Record<string, unknown>).verdict as string });
    });
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeAgentStep("verification");
    const state = makeState();

    await orchestrator.commitSkipped(step, state, "activation-condition-not-met");

    expect(store.persist).toHaveBeenCalledOnce();
    expect(store.appendHistory).toHaveBeenCalledOnce();
    const histEntry = store.appendHistory.mock.calls[0]?.[1] as Record<string, string>;
    expect(histEntry.step).toBe("verification-skipped");
    expect(histEntry.status).toBe("warning");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.verdict).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-015-F: apply — dispatch
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — apply dispatch (TC-015-F)", () => {
  it("apply with kind:success calls commitSuccess and returns updated state", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });
    const result: StepExecutionResult = makeSuccessResult();

    const out = await orchestrator.apply(step, state, deps, result);

    expect(store.persist).toHaveBeenCalledOnce();
    expect(out).toMatchObject({ jobId: "co-test-job" });
  });

  it("apply with kind:skipped calls commitSkipped and persists", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("verification");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });
    const result: StepExecutionResult = { kind: "skipped", skipReason: "no changes" };

    await orchestrator.apply(step, state, deps, result);

    expect(store.persist).toHaveBeenCalledOnce();
  });

  it("apply with kind:halt throws and calls store.fail", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep();
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const err = Object.assign(new Error("test halt"), { code: "AGENT_STEP_FAILED" });
    const result: StepExecutionResult = {
      kind: "halt",
      halt: makeAgentThrowHalt(err, "spec-review"),
    };

    await expect(orchestrator.apply(step, state, deps, result)).rejects.toThrow("test halt");
    expect(store.fail).toHaveBeenCalledOnce();
    expect(store.persist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-015-G: commitRound — round state commit (T-03)
// ---------------------------------------------------------------------------

describe("CommitOrchestrator — commitRound (TC-015-G)", () => {
  it("store.persist called exactly once with 2 success members + coordinator run", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const stepA = makeStep("reviewer-alpha");
    const stepB = makeStep("reviewer-beta");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const memberA = {
      step: stepA,
      startedAt: "2026-01-01T00:00:00.000Z",
      result: makeSuccessResult(makeCompletion("approved")),
    };
    const memberB = {
      step: stepB,
      startedAt: "2026-01-01T00:00:01.000Z",
      result: makeSuccessResult(makeCompletion("needs-fix")),
    };

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    const reviewerStatuses = [
      { name: "reviewer-alpha", status: "approved" as const, approvedAtCommit: "sha1", activationPaths: undefined, invalidatedByCommit: null },
      { name: "reviewer-beta", status: "pending" as const, approvedAtCommit: null, activationPaths: undefined, invalidatedByCommit: null },
    ];

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [memberA, memberB],
      reviewerStatuses,
      coordinatorRun,
      roundError: null,
    });

    // AC #2: persist called exactly once
    expect(store.persist).toHaveBeenCalledOnce();
    // store.fail / transitionJob NOT called (members used produceResult)
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("persisted state contains both member StepRuns + coordinator StepRun", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const stepA = makeStep("reviewer-alpha");
    const stepB = makeStep("reviewer-beta");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const memberA = {
      step: stepA,
      startedAt: "2026-01-01T00:00:00.000Z",
      result: makeSuccessResult(makeCompletion("approved")),
    };
    const memberB = {
      step: stepB,
      startedAt: "2026-01-01T00:00:01.000Z",
      result: makeSuccessResult(makeCompletion("needs-fix")),
    };

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [memberA, memberB],
      reviewerStatuses: [],
      coordinatorRun,
      roundError: null,
    });

    // Capture the state passed to persist
    const persistedState = store.persist.mock.calls[0]?.[0] as import("../../../state/schema.js").JobState;
    expect(persistedState).toBeDefined();

    // Both member StepRuns present
    expect(persistedState.steps?.["reviewer-alpha"]).toHaveLength(1);
    expect(persistedState.steps?.["reviewer-beta"]).toHaveLength(1);
    // Coordinator StepRun present
    expect(persistedState.steps?.["custom-reviewers"]).toHaveLength(1);
    expect(persistedState.steps?.["custom-reviewers"]?.[0]?.outcome.verdict).toBe("needs-fix");
  });

  it("member halt: StepRun with error recorded, store.fail NOT called (AC #3)", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const stepA = makeStep("reviewer-alpha");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const err = Object.assign(new Error("member failed"), { code: "AGENT_STEP_FAILED" });
    const haltResult: StepExecutionResult = {
      kind: "halt",
      halt: makeAgentThrowHalt(err, "reviewer-alpha"),
    };

    const memberA = {
      step: stepA,
      startedAt: "2026-01-01T00:00:00.000Z",
      result: haltResult,
    };

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "escalation" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [memberA],
      reviewerStatuses: [],
      coordinatorRun,
      roundError: null,
    });

    // store.fail NOT called (member halt in round → StepRun record only, no job transition)
    expect(store.fail).not.toHaveBeenCalled();
    // persist still called exactly once
    expect(store.persist).toHaveBeenCalledOnce();

    // Member StepRun has error recorded
    const persistedState = store.persist.mock.calls[0]?.[0] as import("../../../state/schema.js").JobState;
    const memberRuns = persistedState.steps?.["reviewer-alpha"] ?? [];
    expect(memberRuns).toHaveLength(1);
    expect(memberRuns[0]?.outcome.error).not.toBeNull();
  });

  it("reviewerStatuses set on persisted state", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });
    const reviewerStatuses = [
      { name: "reviewer-alpha", status: "approved" as const, approvedAtCommit: "sha-abc", activationPaths: undefined, invalidatedByCommit: null },
    ];

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "approved" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [],
      reviewerStatuses,
      coordinatorRun,
      roundError: null,
    });

    const persistedState = store.persist.mock.calls[0]?.[0] as import("../../../state/schema.js").JobState;
    expect(persistedState.reviewerStatuses).toEqual(reviewerStatuses);
  });

  it("roundError set on persisted state when non-null", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });
    const roundError = { code: "ROUND_NONDECLARED_CHANGE", message: "offending: foo.ts", hint: "inspect" };

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "escalation" as const, findingsPath: null, error: roundError },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [],
      reviewerStatuses: [],
      coordinatorRun,
      roundError,
    });

    const persistedState = store.persist.mock.calls[0]?.[0] as import("../../../state/schema.js").JobState;
    expect(persistedState.error?.code).toBe("ROUND_NONDECLARED_CHANGE");
  });

  it("empty members (fast path): coordinator patch + single persist still occurs", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const coordinatorRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "approved" as const, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    };

    const result = await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [],
      reviewerStatuses: [],
      coordinatorRun,
      roundError: null,
    });

    expect(store.persist).toHaveBeenCalledOnce();
    expect(result.steps?.["custom-reviewers"]).toHaveLength(1);
    expect(result.steps?.["custom-reviewers"]?.[0]?.outcome.verdict).toBe("approved");
  });

  it("verdict:parsed emitted for success members after persist", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const emitted: Array<{ step: string; verdict: string }> = [];
    events.on("verdict:parsed", (payload: Record<string, unknown>) => {
      emitted.push({
        step: payload.step as string,
        verdict: (payload.outcome as Record<string, unknown>).verdict as string,
      });
    });
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);

    const stepA = makeStep("reviewer-alpha");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    await orchestrator.commitRound({
      coordinatorName: "custom-reviewers",
      base: state,
      deps,
      members: [{
        step: stepA,
        startedAt: "2026-01-01T00:00:00.000Z",
        result: makeSuccessResult(makeCompletion("approved")),
      }],
      reviewerStatuses: [],
      coordinatorRun: {
        attempt: 1, sessionId: null,
        outcome: { verdict: "approved" as const, findingsPath: null, error: null },
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
      },
      roundError: null,
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.step).toBe("reviewer-alpha");
    expect(emitted[0]?.verdict).toBe("approved");
  });
});
