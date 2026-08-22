/**
 * Unit tests for CommitOrchestrator — context metrics persistence (T-05, T-06).
 *
 * TC-031: executor が success / timeout / 非 success の 3 経路すべてで context metrics を下流へ渡す
 * TC-032: halt 由来 entry が modelUsage null かつ invocation metrics を含まない
 * TC-033: usage append が失敗しても halt の throw 挙動が変わらない
 * TC-013: 成功 step の context metrics が usage.json に残る
 * TC-014: exhaustion で halt した step の metrics が usage.json に残る
 * TC-017: halt entry が cost 集計を動かさない
 * TC-018: context metrics の無い halt では entry を追加しない
 * TC-042: agent 成功後の main-checkout drift halt でも contextMetrics が usage.json に残る
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CommitOrchestrator } from "../../../../src/core/step/commit-orchestrator.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { readUsageFile } from "../../../../src/core/usage/store.js";
import type { Step, AgentStep } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { StepCompletion } from "../../../../src/core/step/step-completion.js";
import type { StepExecutionResult } from "../../../../src/core/step/commit-orchestrator.js";
import type { StepHalt } from "../../../../src/core/step/step-halt.js";
import { makeNonSuccessHalt, makeTimeoutHalt, makeDriftHalt } from "../../../../src/core/step/step-halt.js";
import type { AgentContextMetrics } from "../../../../src/kernel/context-metrics.js";
import type { Verdict } from "../../../../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-orch-ctx-metrics-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-ctx-metrics-slug";
const TEST_JOB_ID = "ctx-metrics-test-job-001";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: TEST_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-ctx-metrics-slug/request.md",
      title: "Test Context Metrics",
      type: "new-feature",
      slug: TEST_SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-ctx-metrics-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: (_state: JobState, _deps: PipelineDeps) => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeStep(name = "implementer"): Step {
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
    cwd: tempDir,
    slug: TEST_SLUG,
    config: {} as never,
    request: {
      type: "new-feature",
      title: "Test Context Metrics",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "Test request",
      adr: false,
      path: "specrunner/changes/test-ctx-metrics-slug/request.md",
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

function makeSuccessResultWithContextMetrics(
  contextMetrics?: AgentContextMetrics,
): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion: makeCompletion("approved"),
    completedAt: "2026-01-01T00:01:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    session: null,
    modelUsage: {
      "claude-sonnet-4-5": {
        inputTokens: 50000,
        outputTokens: 5000,
        cacheReadInputTokens: 10000,
        cacheCreationInputTokens: 2000,
      },
    },
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
  } as StepExecutionResult & { kind: "success" };
}

// Create the usage.json directory structure
async function setupUsageDir(): Promise<string> {
  const usageDir = path.join(tempDir, "specrunner", "changes", TEST_SLUG);
  await fs.mkdir(usageDir, { recursive: true });
  return path.join(usageDir, "usage.json");
}

// ---------------------------------------------------------------------------
// TC-013: 成功 step の context metrics が usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-013: 成功 step の context metrics が usage.json に残る", () => {
  it("contextMetrics fields survive commitSuccess → appendInvocation → readUsageFile round-trip", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      contextWindowTokens: 200000,
      peakActiveContextTokens: 87500,
      compactionCount: 2,
      contextTokensBeforeCompaction: 156000,
      contextTokensAfterCompaction: 42000,
    };

    const result = makeSuccessResultWithContextMetrics(contextMetrics);

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-013: contextMetrics must be in the persisted entry
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.model).toBe("claude-sonnet-4-5");
    expect(inv.contextMetrics!.contextWindowTokens).toBe(200000);
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(87500);
    expect(inv.contextMetrics!.compactionCount).toBe(2);
    expect(inv.contextMetrics!.contextTokensBeforeCompaction).toBe(156000);
    expect(inv.contextMetrics!.contextTokensAfterCompaction).toBe(42000);
    // No exhaustion
    expect(inv.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });

  it("contextMetrics is absent from usage entry when runner did not observe it", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // No contextMetrics
    const result = makeSuccessResultWithContextMetrics(undefined);

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // contextMetrics must be absent (not null or {} or 0)
    expect(inv.contextMetrics).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(inv, "contextMetrics")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-014: exhaustion で halt した step の context metrics が usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-014: exhaustion で halt した step の metrics が usage.json に残る", () => {
  it("halt with contextMetrics writes a modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      peakActiveContextTokens: 187000,
      exhaustionAtTokens: 187000,
    };

    // Simulate a non-success (exhaustion) halt
    const exhaustionRunResult = {
      error: Object.assign(
        new Error("Claude Code SDK query failed: Prompt is too long"),
        { code: "CLAUDE_CODE_QUERY_FAILED" },
      ),
      contextMetrics,
    };

    const halt = makeNonSuccessHalt(exhaustionRunResult, "implementer", {
      completedAt: "2026-01-01T00:05:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
    });

    // commitHalt throws — catch is expected
    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // One entry added by commitHalt for the halt's contextMetrics
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-032: modelUsage MUST be null (halt entry)
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);

    // TC-032: invocation metrics must NOT be in the halt entry
    expect(Object.prototype.hasOwnProperty.call(inv, "numTurns")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationMs")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationApiMs")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "totalCostUsd")).toBe(false);

    // contextMetrics MUST be in the halt entry
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(187000);
    expect(inv.contextMetrics!.exhaustionAtTokens).toBe(187000);
  });

  it("timeout halt with contextMetrics writes a modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 75000,
    };

    const timeoutRunResult = {
      error: Object.assign(
        new Error("Step 'implementer' timed out after 1800000ms"),
        { code: "STEP_TIMEOUT" },
      ),
      contextMetrics,
    };

    const halt = makeTimeoutHalt(timeoutRunResult, "implementer", {
      completedAt: "2026-01-01T00:30:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
    });

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw
    }

    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(75000);
    // No exhaustionAtTokens (timeout is not context exhaustion)
    expect(inv.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-018: context metrics の無い halt では entry を追加しない
// ---------------------------------------------------------------------------

describe("TC-018: context metrics の無い halt では entry を追加しない", () => {
  it("no usage.json entry is added when halt has no contextMetrics", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Halt without contextMetrics
    const halt: StepHalt = {
      kind: "failed",
      error: { code: "AGENT_STEP_FAILED", message: "some error", hint: "" },
      thrownErr: new Error("some error"),
      recordOpts: {},
    };

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw
    }

    // No entry should be added to usage.json
    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(0);
  });

  it("no usage.json entry when halt has contextMetrics but deps.cwd is absent", async () => {
    await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();

    // deps without cwd
    const depsNoCwd = makeDeps({ cwd: undefined });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 50000,
    };

    const halt = makeNonSuccessHalt(
      { error: Object.assign(new Error("failed"), { code: "AGENT_STEP_FAILED" }), contextMetrics },
      "implementer",
      {},
    );

    try {
      await orchestrator.commitHalt(step, state, halt, depsNoCwd);
    } catch {
      // Expected throw
    }

    // Usage.json should not have been written (cwd was absent)
    const usagePath = path.join(tempDir, "specrunner", "changes", TEST_SLUG, "usage.json");
    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-033: usage append が失敗しても halt の throw 挙動が変わらない
// ---------------------------------------------------------------------------

describe("TC-033: usage append が失敗しても halt の throw 挙動が変わらない", () => {
  it("I/O error in appendInvocation does not suppress the halt rethrow", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();

    // deps with a non-existent directory to trigger I/O error on appendInvocation
    const nonExistentDir = path.join(tempDir, "does-not-exist");
    const deps = makeDeps({ cwd: nonExistentDir });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 150000,
      exhaustionAtTokens: 150000,
    };

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CLAUDE_CODE_QUERY_FAILED" }),
        contextMetrics,
      },
      "implementer",
      {},
    );

    // commitHalt should ALWAYS throw (the FSM rethrow must not be suppressed by I/O failure)
    let threw = false;
    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-017: halt entry が cost 集計を動かさない
// ---------------------------------------------------------------------------

describe("TC-017: halt entry が cost 集計を動かさない", () => {
  it("halt-derived usage entry (modelUsage: null) does not contribute to cost aggregation", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // First: a success entry with model usage
    const successResult = makeSuccessResultWithContextMetrics({
      provider: "claude-code",
      peakActiveContextTokens: 50000,
    });
    await orchestrator.commitSuccess(step, state, deps, successResult);

    // Second: a halt entry with contextMetrics (modelUsage: null)
    const haltContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 180000,
      exhaustionAtTokens: 180000,
    };
    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CLAUDE_CODE_QUERY_FAILED" }),
        contextMetrics: haltContextMetrics,
      },
      "implementer",
      { completedAt: "2026-01-01T00:10:00.000Z" },
    );

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw
    }

    const usageFile = await readUsageFile(usagePath);
    // Two entries: one success + one halt
    expect(usageFile.commandInvocations).toHaveLength(2);

    // Success entry has modelUsage
    const successInv = usageFile.commandInvocations[0]!;
    expect(successInv.modelUsage).not.toBeNull();
    expect(successInv.modelUsage!["claude-sonnet-4-5"]).toBeDefined();
    // Priced entries are never marked context-only
    expect(successInv.contextOnly).toBeUndefined();

    // Halt entry has modelUsage: null — does not contribute to cost
    const haltInv = usageFile.commandInvocations[1]!;
    expect(haltInv.modelUsage).toBeNull();
    expect(haltInv.contextOnly).toBe(true);

    // The null modelUsage entry must not break cost aggregation
    // (aggregation code skips entries with modelUsage: null — backward compat)
    const costEntries = usageFile.commandInvocations.filter((inv) => inv.modelUsage !== null);
    expect(costEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-031: StepExecutionResult success variant has contextMetrics field
// ---------------------------------------------------------------------------

describe("TC-031: StepExecutionResult success variant includes contextMetrics", () => {
  it("contextMetrics set in StepExecutionResult is accessible after construction", () => {
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 100000,
      compactionCount: 1,
    };

    const result: StepExecutionResult & { kind: "success" } = {
      kind: "success",
      completion: makeCompletion("approved"),
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
      contextMetrics,
    };

    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.provider).toBe("claude-code");
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(100000);
    expect(result.contextMetrics!.compactionCount).toBe(1);
  });

  it("makeNonSuccessHalt includes contextMetrics in halt when runResult has it", () => {
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      exhaustionAtTokens: 195000,
    };

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("failed"), { code: "CLAUDE_CODE_QUERY_FAILED" }),
        contextMetrics,
      },
      "implementer",
      {},
    );

    expect(halt.contextMetrics).toBeDefined();
    expect(halt.contextMetrics!.provider).toBe("claude-code");
    expect(halt.contextMetrics!.exhaustionAtTokens).toBe(195000);
  });

  it("makeNonSuccessHalt without contextMetrics has no contextMetrics field", () => {
    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("failed"), { code: "AGENT_STEP_FAILED" }),
      },
      "implementer",
      {},
    );

    expect(halt.contextMetrics).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(halt, "contextMetrics")).toBe(false);
  });

  it("makeTimeoutHalt includes contextMetrics in halt when runResult has it", () => {
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 70000,
    };

    const halt = makeTimeoutHalt(
      {
        error: Object.assign(new Error("timed out"), { code: "STEP_TIMEOUT" }),
        contextMetrics,
      },
      "implementer",
      {},
    );

    expect(halt.contextMetrics).toBeDefined();
    expect(halt.contextMetrics!.peakActiveContextTokens).toBe(70000);
  });
});

// ---------------------------------------------------------------------------
// TC-040: agent 成功後の output contract halt でも contextMetrics が usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-040: agent 成功後の output contract halt でも contextMetrics が usage.json に残る", () => {
  it("output gate halt with contextMetrics writes modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Simulate an output contract halt that carries contextMetrics from a successful runner invocation.
    // makeOutputGateHalt now accepts an optional contextMetrics parameter (TC-040 implementation).
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      peakActiveContextTokens: 150000,
      compactionCount: 0,
    };

    // Construct the halt as makeOutputGateHalt would produce it (with contextMetrics forwarded
    // from the successful runResult)
    const halt: StepHalt = {
      kind: "failed",
      error: {
        code: "STEP_OUTPUT_MISSING",
        message: "Step 'implementer' output contract(s) not satisfied: specrunner/changes/test-ctx-metrics-slug/spec.md",
        hint: "Required step output(s) missing or incomplete.",
      },
      thrownErr: Object.assign(
        new Error("Step 'implementer' output contract(s) not satisfied"),
        { code: "STEP_OUTPUT_MISSING" },
      ),
      recordOpts: { startedAt: "2026-01-01T00:00:00.000Z" },
      history: {
        step: "implementer-failed",
        status: "error",
        message: "implementer failed: STEP_OUTPUT_MISSING — output missing",
      },
      contextMetrics,
    };

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // One entry added by commitHalt for the halt's contextMetrics
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-040: modelUsage MUST be null (halt entry)
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);

    // TC-040: contextMetrics from the runner's success MUST be in the halt entry
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.model).toBe("claude-sonnet-4-5");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(150000);

    // invocation metrics must NOT be in the halt entry
    expect(Object.prototype.hasOwnProperty.call(inv, "numTurns")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationMs")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-041: agent 成功後の commit / push 失敗 halt でも contextMetrics が usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-041: agent 成功後の commit / push 失敗 halt でも contextMetrics が usage.json に残る", () => {
  it("commit/push fail halt with contextMetrics writes modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Simulate a commit/push fail halt that carries contextMetrics from a successful runner invocation.
    // makeCommitFailHalt now accepts an optional contextMetrics parameter (TC-041 implementation).
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 120000,
      compactionCount: 1,
      contextTokensBeforeCompaction: 180000,
      contextTokensAfterCompaction: 50000,
    };

    // Construct the halt as makeCommitFailHalt would produce it (with contextMetrics forwarded
    // from the successful runResult)
    const halt: StepHalt = {
      kind: "failed",
      error: {
        code: "COMMIT_AND_PUSH_FAILED",
        message: "git push failed: remote: Permission denied",
        hint: "",
      },
      thrownErr: Object.assign(
        new Error("git push failed: remote: Permission denied"),
        { code: "COMMIT_AND_PUSH_FAILED" },
      ),
      recordOpts: { startedAt: "2026-01-01T00:00:00.000Z" },
      contextMetrics,
    };

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // One entry added by commitHalt for the halt's contextMetrics
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-041: modelUsage MUST be null (halt entry)
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);

    // TC-041: contextMetrics from the runner's success MUST be in the halt entry
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(120000);
    expect(inv.contextMetrics!.compactionCount).toBe(1);
    expect(inv.contextMetrics!.contextTokensBeforeCompaction).toBe(180000);
    expect(inv.contextMetrics!.contextTokensAfterCompaction).toBe(50000);

    // invocation metrics must NOT be in the halt entry
    expect(Object.prototype.hasOwnProperty.call(inv, "numTurns")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationMs")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-043: modelUsage 欠落 + contextMetrics ありの成功 step でも entry が書かれる
// ---------------------------------------------------------------------------

describe("TC-043: modelUsage 欠落 + contextMetrics ありの成功 step でも entry が書かれる", () => {
  it("success step with undefined modelUsage but contextMetrics writes modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 75000,
      compactionCount: 0,
    };

    // Success result with undefined modelUsage but with contextMetrics
    const result: StepExecutionResult & { kind: "success" } = {
      kind: "success",
      completion: makeCompletion("approved"),
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
      // modelUsage is intentionally absent (undefined) — provider did not return usage
      contextMetrics,
    } as StepExecutionResult & { kind: "success" };

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // TC-043: entry MUST be written even when modelUsage is absent
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-043: modelUsage MUST be null (not undefined — JSON serialization)
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);

    // TC-043: contextMetrics must be persisted correctly
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(75000);
    expect(inv.contextMetrics!.compactionCount).toBe(0);
  });

  it("success step with both undefined modelUsage and no contextMetrics writes NO entry", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Neither modelUsage nor contextMetrics — no entry should be written
    const result: StepExecutionResult & { kind: "success" } = {
      kind: "success",
      completion: makeCompletion("approved"),
      completedAt: "2026-01-01T00:01:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      session: null,
      // No modelUsage, no contextMetrics
    } as StepExecutionResult & { kind: "success" };

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // No entry — neither condition is true
    expect(usageFile.commandInvocations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-042: agent 成功後の main-checkout drift halt でも contextMetrics が usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-042: agent 成功後の main-checkout drift halt でも contextMetrics が usage.json に残る", () => {
  it("drift halt with contextMetrics writes modelUsage:null entry to usage.json", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Simulate a drift halt that carries contextMetrics from a successful runner invocation.
    // makeDriftHalt now accepts an optional contextMetrics parameter (TC-042 implementation).
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      peakActiveContextTokens: 95000,
      compactionCount: 1,
      contextTokensBeforeCompaction: 160000,
      contextTokensAfterCompaction: 40000,
    };

    const drift = {
      drifted: true,
      changes: [{ path: ".specrunner/config.yaml", kind: "modified" as const }],
    };

    const halt = makeDriftHalt(drift, "implementer", TEST_SLUG, { startedAt: "2026-01-01T00:00:00.000Z" }, contextMetrics);

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // One entry added by commitHalt for the halt's contextMetrics
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-042: modelUsage MUST be null (halt entry)
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);

    // TC-042: contextMetrics from the runner's success MUST be in the halt entry
    expect(inv.contextMetrics).toBeDefined();
    expect(inv.contextMetrics!.provider).toBe("claude-code");
    expect(inv.contextMetrics!.model).toBe("claude-sonnet-4-5");
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(95000);
    expect(inv.contextMetrics!.compactionCount).toBe(1);
    expect(inv.contextMetrics!.contextTokensBeforeCompaction).toBe(160000);
    expect(inv.contextMetrics!.contextTokensAfterCompaction).toBe(40000);

    // invocation metrics must NOT be in the halt entry
    expect(Object.prototype.hasOwnProperty.call(inv, "numTurns")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationMs")).toBe(false);
  });

  it("makeDriftHalt includes contextMetrics in halt when provided", () => {
    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 80000,
    };

    const drift = {
      drifted: true,
      changes: [{ path: "specrunner/changes/test-slug/design.md", kind: "modified" as const }],
    };

    const halt = makeDriftHalt(drift, "implementer", "test-slug", {}, contextMetrics);

    expect(halt.contextMetrics).toBeDefined();
    expect(halt.contextMetrics!.provider).toBe("claude-code");
    expect(halt.contextMetrics!.peakActiveContextTokens).toBe(80000);
  });

  it("makeDriftHalt without contextMetrics has no contextMetrics field", () => {
    const drift = {
      drifted: true,
      changes: [{ path: ".specrunner/config.yaml", kind: "created" as const }],
    };

    // No contextMetrics argument — simulates pre-feature or non-claude-code runner
    const halt = makeDriftHalt(drift, "implementer", "test-slug", {});

    expect(halt.contextMetrics).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(halt, "contextMetrics")).toBe(false);
  });

  it("drift halt without contextMetrics does not add a usage.json entry", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const drift = {
      drifted: true,
      changes: [{ path: ".specrunner/config.yaml", kind: "modified" as const }],
    };

    // No contextMetrics — simulates Codex / managed runner path
    const halt = makeDriftHalt(drift, "implementer", TEST_SLUG, { startedAt: "2026-01-01T00:00:00.000Z" });

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // No entry — drift halt without contextMetrics should not write to usage.json
    expect(usageFile.commandInvocations).toHaveLength(0);
  });
});
