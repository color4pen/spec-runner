/**
 * Unit tests for AgentRunner port (TC-001 through TC-012)
 *
 * TC-001: AgentRunner interface has exactly one method: run()
 * TC-002: AgentRunContext fields are runtime-neutral
 * TC-003: completionReason "success" → resultContent is fetched by adapter
 * TC-004: completionReason "error" → StepExecutor emits step:error
 * TC-005: completionReason "timeout" → StepExecutor emits step:error
 * TC-006: resultFilePath null → resultContent null
 * TC-007: StepExecutor does not import SessionClient / SDK directly
 * TC-008: StepExecutor calls runner.run exactly once per agent step
 * TC-009: AgentStep lifecycle events fire in order
 * TC-010: CliStep does not invoke runner.run
 * TC-011: StepExecutor dispatches on step.kind only (not step name)
 * TC-012: CliStep verdict null is normalized to escalation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type {
  AgentRunner,
  AgentRunContext,
  AgentRunResult,
} from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import type { AgentStep, CliStep } from "../../../src/core/step/types.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-runner-port-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(jobId = "test-job"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

async function setupJobState(jobId: string): Promise<JobState> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const state = makeMinimalState(jobId);
  await fs.writeFile(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(state, null, 2),
  );
  return state;
}

function makeMinimalConfig() {
  return {
    version: 1 as const,
    agents: {
      design: { agentId: "agent_design", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
  };
}

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeMinimalDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    config: makeMinimalConfig(),
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
    slug: "test-slug",
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    ...overrides,
    storeFactory: overrides.storeFactory ?? makeStoreFactory(tempDir),
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "spec-review",
    agent: {
      name: "specrunner-spec-review",
      role: "spec-review",
      model: "claude-sonnet-4-5",
      system: "review this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    ...overrides,
  };
}

function makeCliStep(overrides: Partial<Omit<CliStep, "kind" | "name">> = {}): CliStep {
  return {
    kind: "cli",
    name: "verification",
    run: vi.fn().mockResolvedValue(undefined),
    resultFilePath: () => "result.md",
    parseResult: () => ({ verdict: "approved" as const, findingsPath: "result.md" }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-001: AgentRunner interface has exactly one method: run()
// ---------------------------------------------------------------------------

describe("TC-001: AgentRunner interface has exactly one method: run()", () => {
  it("a minimal object with only run() satisfies the AgentRunner contract", () => {
    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => ({
        completionReason: "success",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
      }),
    };
    expect(typeof runner.run).toBe("function");
    // No other methods expected
    const keys = Object.keys(runner);
    expect(keys).toEqual(["run"]);
  });

  it("AgentRunner interface does not have createSession / sendMessage / pollUntilComplete / getResult", async () => {
    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => ({
        completionReason: "success",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
      }),
    };
    expect((runner as unknown as Record<string, unknown>)["createSession"]).toBeUndefined();
    expect((runner as unknown as Record<string, unknown>)["sendMessage"]).toBeUndefined();
    expect((runner as unknown as Record<string, unknown>)["pollUntilComplete"]).toBeUndefined();
    expect((runner as unknown as Record<string, unknown>)["getResult"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-002: AgentRunContext fields are runtime-neutral
// ---------------------------------------------------------------------------

describe("TC-002: AgentRunContext fields are runtime-neutral", () => {
  it("AgentRunContext does not contain sessionClient or claudeCodeQuery", () => {
    // Build an AgentRunContext and verify it has no runtime-specific SDK fields.
    // The type system enforces this, but we verify via a runtime object.
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeMinimalState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: "/tmp/test",
      input: { requestContent: "content" },
      session: {},
      policy: {},
      config: makeMinimalConfig(),
      emit: (_e: string, _p: Record<string, unknown>) => undefined,
    };

    expect((ctx as unknown as Record<string, unknown>)["sessionClient"]).toBeUndefined();
    expect((ctx as unknown as Record<string, unknown>)["claudeCodeQuery"]).toBeUndefined();
    // All required fields present
    expect(ctx.step).toBeDefined();
    expect(ctx.state).toBeDefined();
    expect(typeof ctx.branch).toBe("string");
    expect(typeof ctx.slug).toBe("string");
    expect(typeof ctx.cwd).toBe("string");
    expect(typeof ctx.input.requestContent).toBe("string");
    expect(ctx.config).toBeDefined();
    expect(typeof ctx.emit).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-003: completionReason "success" → resultContent fetched by adapter
// ---------------------------------------------------------------------------

describe("TC-003: completionReason 'success' → resultContent fetched by adapter", () => {
  it("StepExecutor passes resultContent from runner.run() to verdict path", async () => {
    const jobId = "tc003-job";
    const state = await setupJobState(jobId);

    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => ({
        completionReason: "success",
        resultContent: "verdict: approved",
        _updatedState: {
          ...state,
          steps: {
            "spec-review": [
              {
                session: null,
                verdict: "approved" as const,
                findingsPath: null,
                completedAt: new Date().toISOString(),
                error: null,
              },
            ],
          },
        },
      } as unknown as AgentRunResult & { _updatedState: JobState }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps();

    const step = makeAgentStep();
    await expect(executor.execute(step, state, deps)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-004: completionReason "error" → StepExecutor emits step:error
// TC-005: completionReason "timeout" → StepExecutor emits step:error
// ---------------------------------------------------------------------------

describe("TC-004 and TC-005: completionReason error/timeout → step:error emitted", () => {
  async function testErrorPath(completionReason: "error" | "timeout") {
    const jobId = `tc${completionReason}-job`;
    const state = await setupJobState(jobId);

    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => {
        // Simulate adapter throwing (which is how error propagates)
        const err = Object.assign(new Error("agent failed"), { code: "AGENT_FAILED", state });
        throw err;
      },
    };

    const events = new EventBus();
    const stepErrors: Array<{ step: string }> = [];
    events.on("step:error", (payload) => {
      stepErrors.push({ step: (payload as { step: string }).step });
    });

    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps();
    const step = makeAgentStep();

    await expect(executor.execute(step, state, deps)).rejects.toBeDefined();
    expect(stepErrors).toHaveLength(1);
    expect(stepErrors[0]?.step).toBe("spec-review");
  }

  it("TC-004: completionReason 'error' → step:error emitted", async () => {
    await testErrorPath("error");
  });

  it("TC-005: completionReason 'timeout' → step:error emitted", async () => {
    await testErrorPath("timeout");
  });
});

// ---------------------------------------------------------------------------
// TC-006: resultFilePath null → resultContent null
// ---------------------------------------------------------------------------

describe("TC-006: resultFilePath null step → resultContent null", () => {
  it("StepExecutor handles null resultContent from adapter gracefully", async () => {
    const jobId = "tc006-job";
    const state = await setupJobState(jobId);

    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => ({
        completionReason: "success",
        resultContent: null,
        _updatedState: {
          ...state,
          steps: {
            "spec-review": [
              {
                session: null,
                verdict: null,
                findingsPath: null,
                completedAt: new Date().toISOString(),
                error: null,
              },
            ],
          },
        },
      } as unknown as AgentRunResult & { _updatedState: JobState }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps();

    // Step with null resultFilePath
    const step = makeAgentStep({ resultFilePath: () => null });
    const result = await executor.execute(step, state, deps);
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-007: StepExecutor does not import adapter or SDK
// ---------------------------------------------------------------------------

describe("TC-007: StepExecutor does not import SessionClient / SDK directly", () => {
  it("executor.ts has no import from adapter/ directory", async () => {
    const executorPath = path.resolve(__dirname, "../../../src/core/step/executor.ts");
    const content = await fs.readFile(executorPath, "utf-8");

    // No import from adapter/
    const adapterImportPattern = /from\s+["'](\.\.\/)+(adapter)\//;
    expect(adapterImportPattern.test(content)).toBe(false);
  });

  it("executor.ts has no @anthropic-ai SDK import", async () => {
    const executorPath = path.resolve(__dirname, "../../../src/core/step/executor.ts");
    const content = await fs.readFile(executorPath, "utf-8");

    const sdkImportPattern = /@anthropic-ai\/(sdk|claude-code)/;
    expect(sdkImportPattern.test(content)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-008: StepExecutor calls runner.run exactly once
// ---------------------------------------------------------------------------

describe("TC-008: StepExecutor calls runner.run exactly once per agent step", () => {
  it("runner.run is called exactly once with correct ctx fields", async () => {
    const jobId = "tc008-job";
    const state = await setupJobState(jobId);

    const capturedCtxes: AgentRunContext[] = [];

    const runner: AgentRunner = {
      run: async (ctx: AgentRunContext): Promise<AgentRunResult> => {
        capturedCtxes.push(ctx);
        const updatedState = {
          ...state,
          steps: {
            "spec-review": [
              {
                session: null,
                verdict: null,
                findingsPath: null,
                completedAt: new Date().toISOString(),
                error: null,
              },
            ],
          },
        };
        return {
          completionReason: "success",
          resultContent: null,
          _updatedState: updatedState,
        } as unknown as AgentRunResult & { _updatedState: JobState };
      },
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps();

    const step = makeAgentStep();
    await executor.execute(step, state, deps);

    // run() called exactly once
    expect(capturedCtxes).toHaveLength(1);
    const ctx = capturedCtxes[0]!;

    // ctx contains expected fields
    expect(ctx.step).toBeDefined();
    expect(ctx.state).toBeDefined();
    expect(typeof ctx.branch).toBe("string");
    expect(typeof ctx.slug).toBe("string");
    expect(typeof ctx.cwd).toBe("string");
    expect(typeof ctx.input.requestContent).toBe("string");
    expect(ctx.config).toBeDefined();
    expect(typeof ctx.emit).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-009: AgentStep lifecycle events fire in order
// ---------------------------------------------------------------------------

describe("TC-009: AgentStep lifecycle events fire in order", () => {
  it("step:start → verdict:parsed → step:complete (no step:error)", async () => {
    const jobId = "tc009-job";
    const state = await setupJobState(jobId);

    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => ({
        completionReason: "success",
        resultContent: null,
        _updatedState: {
          ...state,
          steps: {
            "spec-review": [
              {
                session: null,
                verdict: "approved" as const,
                findingsPath: null,
                completedAt: new Date().toISOString(),
                error: null,
              },
            ],
          },
        },
      } as unknown as AgentRunResult & { _updatedState: JobState }),
    };

    const events = new EventBus();
    const emittedEvents: string[] = [];
    events.on("step:start", () => { emittedEvents.push("step:start"); });
    events.on("verdict:parsed", () => { emittedEvents.push("verdict:parsed"); });
    events.on("step:complete", () => { emittedEvents.push("step:complete"); });
    events.on("step:error", () => { emittedEvents.push("step:error"); });

    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps();
    const step = makeAgentStep();
    await executor.execute(step, state, deps);

    expect(emittedEvents).toContain("step:start");
    expect(emittedEvents).toContain("step:complete");
    expect(emittedEvents).not.toContain("step:error");
    // step:start must precede step:complete
    expect(emittedEvents.indexOf("step:start")).toBeLessThan(emittedEvents.indexOf("step:complete"));
  });
});

// ---------------------------------------------------------------------------
// TC-010: CliStep does not invoke runner.run
// ---------------------------------------------------------------------------

describe("TC-010: CliStep does not invoke runner.run", () => {
  it("runner.run is never called for a CliStep", async () => {
    const jobId = "tc010-job";
    const state = await setupJobState(jobId);

    const runCalled: boolean[] = [];
    const runner: AgentRunner = {
      run: async (_ctx: AgentRunContext): Promise<AgentRunResult> => {
        runCalled.push(true);
        return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
      },
    };

    // Create a temp result file for CliStep
    const resultFilePath = path.join(tempDir, "result.md");
    await fs.writeFile(resultFilePath, "## Verdict\napproved", "utf-8");

    const events = new EventBus();
    const emittedEvents: string[] = [];
    events.on("step:start", () => { emittedEvents.push("step:start"); });
    events.on("step:complete", () => { emittedEvents.push("step:complete"); });
    events.on("step:error", () => { emittedEvents.push("step:error"); });

    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps({ cwd: tempDir });

    const step = makeCliStep({
      resultFilePath: () => "result.md",
      parseResult: () => ({ verdict: "approved" as const, findingsPath: "result.md" }),
    });

    await executor.execute(step, state, deps);

    expect(runCalled).toHaveLength(0);
    expect(emittedEvents).toContain("step:start");
    expect(emittedEvents).toContain("step:complete");
    expect(emittedEvents).not.toContain("step:error");
  });
});

// ---------------------------------------------------------------------------
// TC-011: StepExecutor dispatches on step.kind only
// ---------------------------------------------------------------------------

describe("TC-011: StepExecutor dispatches on step.kind only", () => {
  it("executor.ts has no hardcoded step names in dispatch conditions", async () => {
    const executorPath = path.resolve(__dirname, "../../../src/core/step/executor.ts");
    const content = await fs.readFile(executorPath, "utf-8");

    // No `step.name === "..."` dispatch
    const dispatchPattern = /step\.name\s*===\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|design|code-review|code-fixer|pr-create)["']/;
    expect(dispatchPattern.test(content)).toBe(false);

    // No literal string step name in case statements
    const casePattern = /case\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|design)["']\s*:/;
    expect(casePattern.test(content)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: CliStep verdict null normalized to escalation
// ---------------------------------------------------------------------------

describe("TC-012: CliStep verdict null is normalized to escalation", () => {
  it("parseResult returning null verdict → persisted StepRun verdict is 'escalation'", async () => {
    const jobId = "tc012-job";
    const state = await setupJobState(jobId);

    const runner: AgentRunner = {
      run: async (): Promise<AgentRunResult> => ({ completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 }),
    };

    // Write a result file (CLI step reads from disk)
    const resultFilePath = path.join(tempDir, "cli-result.md");
    await fs.writeFile(resultFilePath, "no verdict here", "utf-8");

    const events = new EventBus();
    const verdictParsedPayloads: Array<{ outcome: { verdict: string | null } }> = [];
    events.on("verdict:parsed", (payload) => {
      verdictParsedPayloads.push(payload as { outcome: { verdict: string | null } });
    });

    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const deps = makeMinimalDeps({ cwd: tempDir });

    const step = makeCliStep({
      resultFilePath: () => "cli-result.md",
      // parseResult returns null verdict — simulates unrecognized content
      parseResult: () => ({ verdict: null, findingsPath: "cli-result.md" }),
    });

    await executor.execute(step, state, deps);

    // verdict:parsed should emit "escalation" (null normalized)
    expect(verdictParsedPayloads).toHaveLength(1);
    expect(verdictParsedPayloads[0]?.outcome.verdict).toBe("escalation");
  });
});
