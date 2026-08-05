/**
 * Integration tests for CommitOrchestrator — usage.json invocation metrics recording.
 *
 * TC-005: metrics を持つ agent step が usage.json に記録される
 * TC-006: metrics 未提供の runtime ではフィールドが省略される
 * TC-019: error subtype の metrics は usage.json に記録されない (should priority)
 *
 * These tests use a real temp directory for the usage file path so that
 * appendInvocation writes an actual file that can be read back by readUsageFile.
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
import { makeAgentThrowHalt } from "../../../../src/core/step/step-halt.js";
import type { Verdict } from "../../../../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-orch-metrics-test-"));
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

const TEST_SLUG = "test-metrics-slug";
const TEST_JOB_ID = "metrics-test-job-001";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: TEST_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-metrics-slug/request.md",
      title: "Test Metrics",
      type: "new-feature",
      slug: TEST_SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-metrics-slug",
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
      title: "Test Metrics",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "Test request",
      adr: false,
      path: "specrunner/changes/test-metrics-slug/request.md",
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

function makeSuccessResultWithMetrics(
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>,
  invocationMetrics?: {
    numTurns?: number;
    durationMs?: number;
    durationApiMs?: number;
    totalCostUsd?: number;
  },
): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion: makeCompletion("approved"),
    completedAt: "2026-01-01T00:01:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    session: null,
    modelUsage,
    ...(invocationMetrics !== undefined ? { invocationMetrics } : {}),
  } as StepExecutionResult & { kind: "success" };
}

// Create the usage.json directory structure
async function setupUsageDir(): Promise<string> {
  const usageDir = path.join(tempDir, "specrunner", "changes", TEST_SLUG);
  await fs.mkdir(usageDir, { recursive: true });
  return path.join(usageDir, "usage.json");
}

// ---------------------------------------------------------------------------
// TC-005: metrics を持つ agent step が usage.json に記録される
// ---------------------------------------------------------------------------

describe("TC-005: metrics を持つ agent step が usage.json に記録される", () => {
  it("writes all 4 metrics to the usage.json entry when invocationMetrics is provided", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const modelUsage = {
      "claude-sonnet-4-6": {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadInputTokens: 50,
        cacheCreationInputTokens: 20,
      },
    };

    const result = makeSuccessResultWithMetrics(modelUsage, {
      numTurns: 8,
      durationMs: 15000,
      durationApiMs: 12000,
      totalCostUsd: 0.062,
    });

    await orchestrator.commitSuccess(step, state, deps, result);

    // Read back the usage.json and verify metrics were written
    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-005: All 4 metrics must be recorded in the CommandInvocation
    // These assertions will FAIL until implementation adds metrics spreading to appendInvocation call
    expect(inv.numTurns).toBe(8);
    expect(inv.durationMs).toBe(15000);
    expect(inv.durationApiMs).toBe(12000);
    expect(inv.totalCostUsd).toBe(0.062);

    // The existing modelUsage should also be preserved
    expect(inv.modelUsage).toBeDefined();
    expect(inv.modelUsage!["claude-sonnet-4-6"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-006: metrics 未提供の runtime ではフィールドが省略される
// ---------------------------------------------------------------------------

describe("TC-006: metrics 未提供の runtime ではフィールドが省略される", () => {
  it("does not write metrics fields when invocationMetrics is absent from result", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();
    const deps = makeDeps({ storeFactory: makeStoreFactory(store) });

    const modelUsage = {
      "claude-sonnet-4-6": {
        inputTokens: 500,
        outputTokens: 100,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    };

    // No invocationMetrics provided (runtime that doesn't support metrics)
    const result = makeSuccessResultWithMetrics(modelUsage, undefined);

    await orchestrator.commitSuccess(step, state, deps, result);

    // Read back the usage.json
    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(1);

    const inv = usageFile.commandInvocations[0]!;

    // TC-006: metrics fields must NOT be present (not undefined stored as null or 0)
    // "In" check rather than undefined to ensure keys are literally absent
    expect(Object.prototype.hasOwnProperty.call(inv, "numTurns")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationMs")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "durationApiMs")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inv, "totalCostUsd")).toBe(false);

    // But modelUsage should still be there
    expect(inv.modelUsage).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-019: error subtype の metrics は usage.json に記録されない (should)
// ---------------------------------------------------------------------------

describe("TC-019: error subtype の metrics は usage.json に記録されない", () => {
  it("does not write any entry to usage.json when step ends in error (commitHalt path)", async () => {
    const usagePath = await setupUsageDir();
    const store = makeStoreMock();
    const events = new EventBus();
    const orchestrator = new CommitOrchestrator(makeStoreFactory(store), events);
    const step = makeStep("implementer");
    const state = makeState();

    // Error result — this goes through commitHalt, not commitSuccess
    // The error subtype metrics should NOT be recorded because applySuccessPostPersistEffects
    // is only called on the success path (design decision D3)
    const err = Object.assign(
      new Error("agent failed"),
      { code: "AGENT_STEP_FAILED", hint: "" },
    );
    const halt = makeAgentThrowHalt(err, "implementer");

    // commitHalt throws, so we need to catch it
    try {
      await orchestrator.commitHalt(step, state, halt);
    } catch {
      // Expected to throw
    }

    // No entries should have been written to usage.json (file doesn't exist)
    const usageFile = await readUsageFile(usagePath);
    expect(usageFile.commandInvocations).toHaveLength(0);
  });
});
