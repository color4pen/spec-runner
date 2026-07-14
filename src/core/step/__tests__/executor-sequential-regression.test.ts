/**
 * Sequential step observational invariant regression tests (B-13/B-14).
 *
 * Asserts that the externally observable state (what gets persisted, what gets
 * thrown) is unchanged after the single-writer refactor (T-03):
 *
 *   - Agent success step (producer-like): verdict in steps[], correct history appended
 *   - Agent non-success (error): throws, state.status=failed, state.error set
 *   - Agent timeout (awaiting-resume): throws, state.status=awaiting-resume,
 *     resumePoint set, appendInterruption called
 *   - CLI step success (prose-parse path): verdict in steps[], persist called
 *
 * These tests use StepExecutor end-to-end (not CommitOrchestrator in isolation)
 * to confirm that the produce → CommitOrchestrator.apply pipeline produces
 * identical observable effects to the pre-refactor executor.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as fs from "node:fs/promises";
import { EventBus } from "../../event/event-bus.js";
import { StepExecutor } from "../executor.js";
import type { AgentStep, CliStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState, HistoryEntry } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "seq-reg-job",
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
    branch: "feat/example-abc12345",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/**
 * A tracking store that captures appendHistory calls and the last persisted state.
 * fail() properly transitions status to "failed" (as real JobStateStore does).
 */
function makeTrackingStore() {
  const appendHistoryCalls: Array<Omit<HistoryEntry, "ts">> = [];
  let lastPersisted: JobState | null = null;

  return {
    update: vi.fn(async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch })),
    appendHistory: vi.fn(async (state: JobState, entry: HistoryEntry) => {
      appendHistoryCalls.push({ step: entry.step, status: entry.status, message: entry.message });
      return state;
    }),
    fail: vi.fn(async (state: JobState) => ({ ...state, status: "failed" as const })),
    persist: vi.fn(async (s: JobState) => { lastPersisted = s; }),
    appendLineage: vi.fn(async () => undefined),
    appendInterruption: vi.fn(async (_entry: Record<string, unknown>) => undefined),
    get historySteps() { return appendHistoryCalls.map((e) => e.step); },
    get lastPersistedState() { return lastPersisted; },
  };
}

function makeAgentStep(name = "spec-review", verdict: "approved" | "success" = "approved"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    completionVerdict: verdict,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict, findingsPath: null }),
  };
}

/** Relative path for the CLI result file under tmpdir in TC-REG-04 */
const CLI_RESULT_RELATIVE = "seq-reg-verification-result.md";

function makeCliStepDecl(name = "verification"): CliStep {
  return {
    kind: "cli",
    name,
    run: vi.fn(async () => {}),
    // Relative path — resolved against deps.cwd (= os.tmpdir()) in runCliStep
    resultFilePath: () => CLI_RESULT_RELATIVE,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

function makeSuccessRunner() {
  return {
    run: vi.fn(async () => ({
      completionReason: "success" as const,
      resultContent: null,
      sessionId: "sess-001",
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
    })),
  };
}

function makeErrorRunner() {
  const err = Object.assign(new Error("agent step failed hard"), { code: "AGENT_STEP_FAILED" });
  return {
    run: vi.fn(async () => ({
      completionReason: "error" as const,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
      error: err,
    })),
    err,
  };
}

function makeTimeoutRunner() {
  const err = Object.assign(new Error("agent timed out"), { code: "POLL_TIMEOUT" });
  return {
    run: vi.fn(async () => ({
      completionReason: "timeout" as const,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
      error: err,
    })),
    err,
  };
}

function makeDeps(store: ReturnType<typeof makeTrackingStore>): PipelineDeps {
  const storeFactory = () => store as never;
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
    storeFactory,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
  } as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-REG-01: Agent success step — verdict in steps[], history appended
// ---------------------------------------------------------------------------

describe("TC-REG-01: Agent success step — observational invariants", () => {
  it("verdict appears in resultState.steps after successful execute()", async () => {
    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);
    const step = makeAgentStep("spec-review", "approved");
    const state = makeState();
    const deps = makeDeps(store);

    const resultState = await executor.execute(step, state, deps);

    // Verdict in steps
    const stepRuns = resultState.steps?.["spec-review"] ?? [];
    expect(stepRuns.length).toBeGreaterThan(0);
    expect(stepRuns[stepRuns.length - 1]?.outcome.verdict).toBe("approved");
  });

  it("store.persist called twice on success (projection persist + branch/PR patch persist)", async () => {
    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);
    const step = makeAgentStep("spec-review", "approved");
    const deps = makeDeps(store);

    await executor.execute(step, makeState(), deps);

    expect(store.persist).toHaveBeenCalledTimes(2);
  });

  it("history includes {step}-started and {step}-verdict entries", async () => {
    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);
    const step = makeAgentStep("spec-review", "approved");
    const deps = makeDeps(store);

    await executor.execute(step, makeState(), deps);

    // begin() appends {step}-started via store.appendHistory
    expect(store.historySteps).toContain("spec-review-started");
    // commitSuccess() appends {step}-verdict via pure appendHistoryEntry (in persisted state)
    const history = store.lastPersistedState?.history ?? [];
    expect(history.some((e: { step: string }) => e.step === "spec-review-verdict")).toBe(true);
  });

  it("store.fail and appendInterruption are NOT called on success", async () => {
    const store = makeTrackingStore();
    const runner = makeSuccessRunner();
    const executor = new StepExecutor(new EventBus(), runner as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    await executor.execute(step, makeState(), deps);

    expect(store.fail).not.toHaveBeenCalled();
    expect(store.appendInterruption).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-REG-02: Agent non-success (error) — throws, state.status=failed
// ---------------------------------------------------------------------------

describe("TC-REG-02: Agent non-success failure — observational invariants", () => {
  it("throws when runner returns completionReason 'error'", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeErrorRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("implementer", "success");
    const deps = makeDeps(store);

    await expect(executor.execute(step, makeState(), deps)).rejects.toThrow();
  });

  it("thrown error has .state attached with status=failed", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeErrorRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("implementer", "success");
    const deps = makeDeps(store);

    let caughtErr: Error & { state?: JobState } | undefined;
    try {
      await executor.execute(step, makeState(), deps);
    } catch (e) {
      caughtErr = e as Error & { state?: JobState };
    }

    expect(caughtErr?.state).toBeDefined();
    expect(caughtErr?.state?.status).toBe("failed");
  });

  it("store.fail called, persist called, no appendInterruption", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeErrorRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("implementer");
    const deps = makeDeps(store);

    try { await executor.execute(step, makeState(), deps); } catch { /* expected */ }

    expect(store.fail).toHaveBeenCalledOnce();
    expect(store.persist).toHaveBeenCalledOnce();
    expect(store.appendInterruption).not.toHaveBeenCalled();
  });

  it("no {step}-failed history entry for non-success (makeNonSuccessHalt has no history)", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeErrorRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("implementer");
    const deps = makeDeps(store);

    try { await executor.execute(step, makeState(), deps); } catch { /* expected */ }

    // non-success guard uses makeNonSuccessHalt which has history:undefined → no extra append
    expect(store.historySteps).not.toContain("implementer-failed");
  });
});

// ---------------------------------------------------------------------------
// TC-REG-03: Agent timeout (awaiting-resume) — state.status=awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-REG-03: Agent timeout (awaiting-resume) — observational invariants", () => {
  it("throws on timeout", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeTimeoutRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    await expect(executor.execute(step, makeState(), deps)).rejects.toThrow();
  });

  it("thrown error has .state with status=awaiting-resume and resumePoint set", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeTimeoutRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    let caughtErr: Error & { state?: JobState } | undefined;
    try {
      await executor.execute(step, makeState(), deps);
    } catch (e) {
      caughtErr = e as Error & { state?: JobState };
    }

    expect(caughtErr?.state?.status).toBe("awaiting-resume");
    expect(caughtErr?.state?.resumePoint).toBeDefined();
    expect(caughtErr?.state?.resumePoint?.reason).toBe("timeout");
    expect(caughtErr?.state?.resumePoint?.step).toBe("spec-review");
  });

  it("appendInterruption called with type=interruption reason=timeout", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeTimeoutRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    try { await executor.execute(step, makeState(), deps); } catch { /* expected */ }

    expect(store.appendInterruption).toHaveBeenCalledOnce();
    const arg = store.appendInterruption.mock.calls[0]?.[0] as unknown as Record<string, string>;
    expect(arg.type).toBe("interruption");
    expect(arg.reason).toBe("timeout");
  });

  it("store.fail NOT called (awaiting-resume uses transitionJob instead)", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeTimeoutRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    try { await executor.execute(step, makeState(), deps); } catch { /* expected */ }

    expect(store.fail).not.toHaveBeenCalled();
    expect(store.persist).toHaveBeenCalledOnce();
  });

  it("{step}-timeout history entry appended", async () => {
    const store = makeTrackingStore();
    const { run: runner } = makeTimeoutRunner();
    const executor = new StepExecutor(new EventBus(), { run: runner } as never, () => store as never);
    const step = makeAgentStep("spec-review");
    const deps = makeDeps(store);

    try { await executor.execute(step, makeState(), deps); } catch { /* expected */ }

    expect(store.historySteps).toContain("spec-review-timeout");
  });
});

// ---------------------------------------------------------------------------
// TC-REG-04: CLI step success (prose-parse path)
// ---------------------------------------------------------------------------

describe("TC-REG-04: CLI step success (prose-parse) — observational invariants", () => {
  const tmpdir = os.tmpdir();
  const resultFilePath = nodePath.join(tmpdir, CLI_RESULT_RELATIVE);

  beforeAll(async () => {
    // Create the result file so runCliStep reads it (resultContent !== null → prose-parse path)
    await fs.writeFile(resultFilePath, "verification result content");
  });

  afterAll(async () => {
    try { await fs.unlink(resultFilePath); } catch { /* ignore */ }
  });

  it("verdict appears in resultState.steps after CLI step execute() (prose-parse)", async () => {
    const store = makeTrackingStore();
    const executor = new StepExecutor(new EventBus(), {} as never, () => store as never);
    const step = makeCliStepDecl("verification");
    // Set cwd to tmpdir so path.resolve(cwd, CLI_RESULT_RELATIVE) finds the file
    const deps = { ...makeDeps(store), cwd: tmpdir };

    const resultState = await executor.execute(step, makeState(), deps);

    // parseResult is called with the file content → returns { verdict: "success" }
    const stepRuns = resultState.steps?.["verification"] ?? [];
    expect(stepRuns.length).toBeGreaterThan(0);
    expect(stepRuns[stepRuns.length - 1]?.outcome.verdict).toBe("success");
  });

  it("store.persist called twice on CLI success, step-transition history appended", async () => {
    const store = makeTrackingStore();
    const executor = new StepExecutor(new EventBus(), {} as never, () => store as never);
    const step = makeCliStepDecl("verification");
    const deps = { ...makeDeps(store), cwd: tmpdir };

    await executor.execute(step, makeState(), deps);

    expect(store.persist).toHaveBeenCalledTimes(2);
    // begin() appends step-transition for CLI steps via store.appendHistory
    expect(store.historySteps).toContain("step-transition");
    // commitSuccess appends verification-verdict via pure appendHistoryEntry (in persisted state)
    const history = store.lastPersistedState?.history ?? [];
    expect(history.some((e: { step: string }) => e.step === "verification-verdict")).toBe(true);
  });

  it("store.fail and appendInterruption NOT called on CLI success", async () => {
    const store = makeTrackingStore();
    const executor = new StepExecutor(new EventBus(), {} as never, () => store as never);
    const step = makeCliStepDecl("verification");
    const deps = { ...makeDeps(store), cwd: tmpdir };

    await executor.execute(step, makeState(), deps);

    expect(store.fail).not.toHaveBeenCalled();
    expect(store.appendInterruption).not.toHaveBeenCalled();
  });
});
