/**
 * Unit tests for CommitOrchestrator — fresh-session-rollover contextOnly entries (T-06).
 *
 * TC-015: rollover observation が success path で usage.json に contextOnly エントリとして記録される
 * TC-030: sessionRollovers が無い場合の usage.json 出力が従来と byte 等価
 * TC-031: halt 経路でも rollover contextOnly エントリが usage.json に残る
 * TC-032: rollover usage 追記失敗が step 成功 / halt の FSM 遷移を妨げない
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
import { makeNonSuccessHalt, makeTimeoutHalt } from "../../../../src/core/step/step-halt.js";
import type { AgentContextMetrics } from "../../../../src/kernel/context-metrics.js";
import type { AgentSessionRollover } from "../../../../src/core/port/agent-runner.js";
import type { Verdict } from "../../../../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-orch-rollover-test-"));
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

const TEST_SLUG = "test-rollover-slug";
const TEST_JOB_ID = "rollover-test-job-001";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: TEST_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-rollover-slug/request.md",
      title: "Test Rollover",
      type: "new-feature",
      slug: TEST_SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-rollover-slug",
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
      title: "Test Rollover",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "Test request",
      adr: false,
      path: "specrunner/changes/test-rollover-slug/request.md",
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

function makeRollover(attempt: number, contextMetrics?: AgentContextMetrics): AgentSessionRollover {
  return {
    attempt,
    reason: "context-exhaustion",
    sessionId: `session-${attempt}-id`,
    errorMessage: `Prompt is too long (attempt ${attempt})`,
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),
  };
}

function makeSuccessResult(
  overrides: Partial<StepExecutionResult & { kind: "success" }> = {},
): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion: makeCompletion("approved"),
    completedAt: "2026-01-01T00:05:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    session: null,
    modelUsage: {
      "claude-sonnet-4-5": {
        inputTokens: 100000,
        outputTokens: 10000,
        cacheReadInputTokens: 20000,
        cacheCreationInputTokens: 5000,
      },
    },
    ...overrides,
  } as StepExecutionResult & { kind: "success" };
}

// Create the usage.json directory structure
async function setupUsageDir(): Promise<string> {
  const usageDir = path.join(tempDir, "specrunner", "changes", TEST_SLUG);
  await fs.mkdir(usageDir, { recursive: true });
  return path.join(usageDir, "usage.json");
}

// ---------------------------------------------------------------------------
// TC-015: rollover observation が success path で usage.json に contextOnly エントリとして記録される
// ---------------------------------------------------------------------------

describe("TC-015: rollover observation が success path で usage.json に contextOnly エントリとして記録される", () => {
  it("1 rollover + success → usage.json に rollover contextOnly エントリ + 通常 success エントリ (計2件)", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      contextWindowTokens: 200000,
      peakActiveContextTokens: 195000,
      exhaustionAtTokens: 195000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const successContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      model: "claude-sonnet-4-5",
      contextWindowTokens: 200000,
      peakActiveContextTokens: 85000,
    };

    const result = makeSuccessResult({ sessionRollovers, contextMetrics: successContextMetrics });

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // TC-015: 2 entries: rollover contextOnly first, then the success entry
    expect(usageFile.commandInvocations).toHaveLength(2);

    // First entry: rollover contextOnly
    const rolloverInv = usageFile.commandInvocations[0]!;
    expect(rolloverInv.modelUsage).toBeNull();
    expect(rolloverInv.contextOnly).toBe(true);
    expect(rolloverInv.contextMetrics).toBeDefined();
    expect(rolloverInv.contextMetrics!.peakActiveContextTokens).toBe(195000);
    expect(rolloverInv.contextMetrics!.exhaustionAtTokens).toBe(195000);
    expect(rolloverInv.stepName).toBe("implementer");
    expect(rolloverInv.jobId).toBe(TEST_JOB_ID);

    // Second entry: normal success entry
    const successInv = usageFile.commandInvocations[1]!;
    expect(successInv.modelUsage).not.toBeNull();
    expect(successInv.modelUsage!["claude-sonnet-4-5"]).toBeDefined();
    expect(successInv.contextOnly).toBeUndefined();
    expect(successInv.contextMetrics).toBeDefined();
    expect(successInv.contextMetrics!.peakActiveContextTokens).toBe(85000);
    // No exhaustionAtTokens on the final success session
    expect(successInv.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });

  it("2 rollovers + success → usage.json に rollover contextOnly エントリ 2 件 + success エントリ 1 件 (計3件)", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const rollover1Metrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 199000,
      exhaustionAtTokens: 199000,
    };
    const rollover2Metrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 197500,
      exhaustionAtTokens: 197500,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rollover1Metrics),
      makeRollover(2, rollover2Metrics),
    ];

    const result = makeSuccessResult({ sessionRollovers });

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // 3 entries: 2 rollover contextOnly + 1 success
    expect(usageFile.commandInvocations).toHaveLength(3);

    const r1 = usageFile.commandInvocations[0]!;
    expect(r1.modelUsage).toBeNull();
    expect(r1.contextOnly).toBe(true);
    expect(r1.contextMetrics!.peakActiveContextTokens).toBe(199000);
    expect(r1.contextMetrics!.exhaustionAtTokens).toBe(199000);

    const r2 = usageFile.commandInvocations[1]!;
    expect(r2.modelUsage).toBeNull();
    expect(r2.contextOnly).toBe(true);
    expect(r2.contextMetrics!.peakActiveContextTokens).toBe(197500);
    expect(r2.contextMetrics!.exhaustionAtTokens).toBe(197500);

    const r3 = usageFile.commandInvocations[2]!;
    expect(r3.modelUsage).not.toBeNull();
    // contextOnly is not set on the success entry
    expect(r3.contextOnly).toBeUndefined();
  });

  it("rollover で contextMetrics が無い場合は rollover エントリを追記しない", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Rollover without contextMetrics — no usage entry should be added for it
    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, undefined),  // no contextMetrics
    ];

    const result = makeSuccessResult({ sessionRollovers });

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // Only 1 entry: the success entry (rollover had no contextMetrics to record)
    expect(usageFile.commandInvocations).toHaveLength(1);
    expect(usageFile.commandInvocations[0]!.modelUsage).not.toBeNull();
    expect(usageFile.commandInvocations[0]!.contextOnly).toBeUndefined();
  });

  it("rollover contextOnly エントリがコスト集計に影響しない", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 198000,
      exhaustionAtTokens: 198000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const result = makeSuccessResult({ sessionRollovers });
    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // 2 entries: rollover + success
    expect(usageFile.commandInvocations).toHaveLength(2);

    // Only the success entry contributes to cost aggregation
    const pricedEntries = usageFile.commandInvocations.filter((inv) => inv.modelUsage !== null);
    expect(pricedEntries).toHaveLength(1);
    expect(pricedEntries[0]!.modelUsage!["claude-sonnet-4-5"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-030: sessionRollovers が無い場合の usage.json 出力が従来と byte 等価
// ---------------------------------------------------------------------------

describe("TC-030: sessionRollovers が無い場合の usage.json 出力が従来と byte 等価", () => {
  it("sessionRollovers undefined → rollover なし基準と同一の entry 数", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Success result with NO sessionRollovers (baseline)
    const result = makeSuccessResult({ sessionRollovers: undefined });

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // Exactly 1 entry — no rollover contextOnly entries added
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;
    // Normal success entry — modelUsage present, no contextOnly flag
    expect(inv.modelUsage).not.toBeNull();
    expect(inv.contextOnly).toBeUndefined();
  });

  it("sessionRollovers 空配列 → rollover なし基準と同一の entry 数", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    // Success result with empty sessionRollovers
    const result = makeSuccessResult({ sessionRollovers: [] });

    await orchestrator.commitSuccess(step, state, deps, result);

    const usageFile = await readUsageFile(usagePath);
    // Exactly 1 entry — empty array means no rollover contextOnly entries
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;
    expect(inv.modelUsage).not.toBeNull();
    expect(inv.contextOnly).toBeUndefined();
  });

  it("halt with no sessionRollovers → rollover なし基準と同一の entry 数", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const contextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 190000,
      exhaustionAtTokens: 190000,
    };

    // makeNonSuccessHalt with no sessionRollovers
    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        contextMetrics,
        // sessionRollovers: absent
      },
      "implementer",
      { completedAt: "2026-01-01T00:05:00.000Z" },
    );

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // Exactly 1 entry: the halt's own contextMetrics entry (no rollover contextOnly entries)
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;
    expect(inv.modelUsage).toBeNull();
    expect(inv.contextOnly).toBe(true);
    // Halt's own contextMetrics — not a rollover entry
    expect(inv.contextMetrics!.peakActiveContextTokens).toBe(190000);
  });
});

// ---------------------------------------------------------------------------
// TC-031: halt 経路でも rollover contextOnly エントリが usage.json に残る
// ---------------------------------------------------------------------------

describe("TC-031: halt 経路でも rollover contextOnly エントリが usage.json に残る", () => {
  it("makeNonSuccessHalt で sessionRollovers ありの halt → rollover エントリ + halt エントリ (計2件)", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 199000,
      exhaustionAtTokens: 199000,
    };

    const haltContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 198500,
      exhaustionAtTokens: 198500,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long (budget exhausted)"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        contextMetrics: haltContextMetrics,
        sessionRollovers,
      },
      "implementer",
      { completedAt: "2026-01-01T00:10:00.000Z" },
    );

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // 2 entries: rollover contextOnly first, then the halt's own contextMetrics entry
    expect(usageFile.commandInvocations).toHaveLength(2);

    // First entry: rollover contextOnly
    const rolloverInv = usageFile.commandInvocations[0]!;
    expect(rolloverInv.modelUsage).toBeNull();
    expect(rolloverInv.contextOnly).toBe(true);
    expect(rolloverInv.contextMetrics).toBeDefined();
    expect(rolloverInv.contextMetrics!.peakActiveContextTokens).toBe(199000);
    expect(rolloverInv.contextMetrics!.exhaustionAtTokens).toBe(199000);
    expect(rolloverInv.stepName).toBe("implementer");
    expect(rolloverInv.jobId).toBe(TEST_JOB_ID);

    // Second entry: the halt's own contextMetrics entry
    const haltInv = usageFile.commandInvocations[1]!;
    expect(haltInv.modelUsage).toBeNull();
    expect(haltInv.contextOnly).toBe(true);
    expect(haltInv.contextMetrics).toBeDefined();
    expect(haltInv.contextMetrics!.peakActiveContextTokens).toBe(198500);
    expect(haltInv.contextMetrics!.exhaustionAtTokens).toBe(198500);
  });

  it("makeTimeoutHalt で sessionRollovers ありの halt → rollover エントリ + halt エントリ (計2件)", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 195000,
      exhaustionAtTokens: 195000,
    };

    const haltContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 145000,
      // No exhaustionAtTokens — it was a timeout, not exhaustion
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const halt = makeTimeoutHalt(
      {
        error: Object.assign(new Error("Step 'implementer' timed out after 1800000ms"), { code: "STEP_TIMEOUT" }),
        contextMetrics: haltContextMetrics,
        sessionRollovers,
      },
      "implementer",
      { completedAt: "2026-01-01T00:30:00.000Z" },
    );

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw from attachStateAndRethrow
    }

    const usageFile = await readUsageFile(usagePath);
    // 2 entries: rollover contextOnly + timeout halt entry
    expect(usageFile.commandInvocations).toHaveLength(2);

    const rolloverInv = usageFile.commandInvocations[0]!;
    expect(rolloverInv.modelUsage).toBeNull();
    expect(rolloverInv.contextOnly).toBe(true);
    expect(rolloverInv.contextMetrics!.peakActiveContextTokens).toBe(195000);
    expect(rolloverInv.contextMetrics!.exhaustionAtTokens).toBe(195000);

    const haltInv = usageFile.commandInvocations[1]!;
    expect(haltInv.modelUsage).toBeNull();
    expect(haltInv.contextOnly).toBe(true);
    expect(haltInv.contextMetrics!.peakActiveContextTokens).toBe(145000);
    expect(haltInv.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });

  it("rollover で contextMetrics が無い場合は halt 経路でも rollover エントリを追記しない", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const haltContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 198000,
      exhaustionAtTokens: 198000,
    };

    // Rollover without contextMetrics
    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, undefined),
    ];

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        contextMetrics: haltContextMetrics,
        sessionRollovers,
      },
      "implementer",
      {},
    );

    try {
      await orchestrator.commitHalt(step, state, halt, deps);
    } catch {
      // Expected throw
    }

    const usageFile = await readUsageFile(usagePath);
    // Only 1 entry: the halt's own contextMetrics (rollover had no contextMetrics)
    expect(usageFile.commandInvocations).toHaveLength(1);
    expect(usageFile.commandInvocations[0]!.contextMetrics!.peakActiveContextTokens).toBe(198000);
  });
});

// ---------------------------------------------------------------------------
// TC-032: rollover usage 追記失敗が step 成功 / halt の FSM 遷移を妨げない
// ---------------------------------------------------------------------------

describe("TC-032: rollover usage 追記失敗が step 成功 / halt の FSM 遷移を妨げない", () => {
  it("rollover appendInvocation I/O 失敗でも commitSuccess が正常完了する", async () => {
    // Do NOT call setupUsageDir() — use a non-existent path to trigger I/O failure
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();

    // Non-existent cwd → appendInvocation will fail to create usage.json
    const nonExistentDir = path.join(tempDir, "does-not-exist");
    const deps = makeDeps({ cwd: nonExistentDir });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 195000,
      exhaustionAtTokens: 195000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const result = makeSuccessResult({ sessionRollovers });

    // commitSuccess should NOT throw even though appendInvocation will fail
    await expect(orchestrator.commitSuccess(step, state, deps, result)).resolves.not.toThrow();

    // store.persist was still called (step state was committed)
    expect(store.persist).toHaveBeenCalledTimes(1);
  });

  it("rollover appendInvocation I/O 失敗でも commitHalt の throw 挙動が変わらない", async () => {
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();

    // Non-existent cwd → appendInvocation will fail
    const nonExistentDir = path.join(tempDir, "does-not-exist");
    const deps = makeDeps({ cwd: nonExistentDir });

    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 198000,
      exhaustionAtTokens: 198000,
    };

    const haltContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 197000,
      exhaustionAtTokens: 197000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long (budget exhausted)"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        contextMetrics: haltContextMetrics,
        sessionRollovers,
      },
      "implementer",
      {},
    );

    // commitHalt MUST throw (the FSM rethrow must not be suppressed by I/O failure)
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
// T-06 type-level: makeNonSuccessHalt / makeTimeoutHalt が sessionRollovers を転記する
// ---------------------------------------------------------------------------

describe("makeNonSuccessHalt / makeTimeoutHalt が sessionRollovers を StepHalt へ転記する", () => {
  it("makeNonSuccessHalt: sessionRollovers を含む runResult → halt.sessionRollovers に転記される", () => {
    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 195000,
      exhaustionAtTokens: 195000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        sessionRollovers,
      },
      "implementer",
      {},
    );

    expect(halt.sessionRollovers).toBeDefined();
    expect(halt.sessionRollovers).toHaveLength(1);
    expect(halt.sessionRollovers![0]!.attempt).toBe(1);
    expect(halt.sessionRollovers![0]!.reason).toBe("context-exhaustion");
    expect(halt.sessionRollovers![0]!.contextMetrics!.exhaustionAtTokens).toBe(195000);
  });

  it("makeNonSuccessHalt: sessionRollovers 不在 → halt.sessionRollovers が undefined", () => {
    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        // no sessionRollovers
      },
      "implementer",
      {},
    );

    expect(halt.sessionRollovers).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(halt, "sessionRollovers")).toBe(false);
  });

  it("makeNonSuccessHalt: sessionRollovers 空配列 → halt.sessionRollovers が undefined (omit empty array)", () => {
    const halt = makeNonSuccessHalt(
      {
        error: Object.assign(new Error("Prompt is too long"), { code: "CONTEXT_WINDOW_EXHAUSTED" }),
        sessionRollovers: [],
      },
      "implementer",
      {},
    );

    // Empty array should be treated as "no rollovers" — omit from halt
    expect(halt.sessionRollovers).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(halt, "sessionRollovers")).toBe(false);
  });

  it("makeTimeoutHalt: sessionRollovers を含む runResult → halt.sessionRollovers に転記される", () => {
    const rolloverContextMetrics: AgentContextMetrics = {
      provider: "claude-code",
      peakActiveContextTokens: 193000,
      exhaustionAtTokens: 193000,
    };

    const sessionRollovers: AgentSessionRollover[] = [
      makeRollover(1, rolloverContextMetrics),
    ];

    const halt = makeTimeoutHalt(
      {
        error: Object.assign(new Error("timed out"), { code: "STEP_TIMEOUT" }),
        sessionRollovers,
      },
      "implementer",
      {},
    );

    expect(halt.sessionRollovers).toBeDefined();
    expect(halt.sessionRollovers).toHaveLength(1);
    expect(halt.sessionRollovers![0]!.attempt).toBe(1);
    expect(halt.sessionRollovers![0]!.reason).toBe("context-exhaustion");
  });

  it("makeTimeoutHalt: sessionRollovers 不在 → halt.sessionRollovers が undefined", () => {
    const halt = makeTimeoutHalt(
      {
        error: Object.assign(new Error("timed out"), { code: "STEP_TIMEOUT" }),
        // no sessionRollovers
      },
      "implementer",
      {},
    );

    expect(halt.sessionRollovers).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(halt, "sessionRollovers")).toBe(false);
  });
});
