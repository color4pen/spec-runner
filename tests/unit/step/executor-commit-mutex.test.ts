/**
 * Tests for commit mutex serialization in StepExecutor.
 *
 * TC-CM-001: single step → finalizeStepArtifacts called exactly once
 * TC-CM-002: two parallel steps → finalizeStepArtifacts calls are serialized (no overlap)
 * TC-CM-003: first finalize fails → second finalize still runs (error isolation via .catch)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import { PRODUCER_REPORT_TOOL } from "../../../src/core/step/report-tool.js";
import type { AgentStepName } from "../../../src/kernel/agent-definition.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-mutex-test-"));
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string, stepName = "code-fixer"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug", baseBranch: "main" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: stepName,
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

function makeSuccessRunner(): AgentRunner {
  return {
    async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    },
  };
}

/**
 * Build a RuntimeStrategy with an injectable finalizeStepArtifacts implementation.
 */
function makeStrategy(opts: {
  finalizeStepArtifacts: (step: AgentStep, ...rest: unknown[]) => Promise<void>;
}): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner: () => makeSuccessRunner(),
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(): Promise<string | null> { return null; },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(step, ...rest): Promise<void> {
      return opts.finalizeStepArtifacts(step as AgentStep, ...rest);
    },
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs: { path: string }[]) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async validateStepOutputs() { return { violations: [] }; },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
  };
}

function makeDeps(runtimeStrategy?: RuntimeStrategy): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    runtimeStrategy,
  };
}

function makeStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { name: `specrunner-${name}`, role: name as AgentStepName, model: "claude-sonnet-4-5", system: "test", tools: [] },
    buildMessage: () => "test",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: PRODUCER_REPORT_TOOL,
    completionVerdict: "success",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-CM-001: single step → finalizeStepArtifacts called exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CM-001: single step → finalizeStepArtifacts called exactly once", () => {
  it("invokes finalizeStepArtifacts exactly once for a single step", async () => {
    const jobId = "tc-cm-001";
    const state = makeJobState(jobId, "code-fixer");
    await seedJobState(jobId, state);

    let callCount = 0;
    const strategy = makeStrategy({
      async finalizeStepArtifacts() {
        callCount++;
      },
    });

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    await executor.execute(makeStep("code-fixer"), state, makeDeps(strategy));

    expect(callCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CM-002: parallel steps → finalizeStepArtifacts serialized (no overlap)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CM-002: parallel steps → finalizeStepArtifacts serialized", () => {
  it("ensures concurrent finalizeStepArtifacts calls never overlap", async () => {
    const jobIdA = "tc-cm-002-a";
    const jobIdB = "tc-cm-002-b";
    const stateA = makeJobState(jobIdA, "code-fixer");
    const stateB = makeJobState(jobIdB, "implementer");
    await seedJobState(jobIdA, stateA);
    await seedJobState(jobIdB, stateB);

    // Track concurrent executions: if mutex is working, count never exceeds 1.
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const strategy = makeStrategy({
      async finalizeStepArtifacts() {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        // Yield event loop to give the other step a chance to enter concurrently.
        await new Promise<void>((r) => setTimeout(r, 10));
        concurrentCount--;
      },
    });

    // Share a single executor instance (same commitMutex).
    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    const deps = makeDeps(strategy);

    await Promise.all([
      executor.execute(makeStep("code-fixer"), stateA, deps),
      executor.execute(makeStep("implementer"), stateB, deps),
    ]);

    // If the mutex is working, at most one finalizeStepArtifacts runs at a time.
    expect(maxConcurrent).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-CM-003: first finalize fails → second still runs (error isolation)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-CM-003: first finalize failure does not block second finalize", () => {
  it("runs the second finalizeStepArtifacts even when the first one throws", async () => {
    const jobIdA = "tc-cm-003-a";
    const jobIdB = "tc-cm-003-b";
    const stateA = makeJobState(jobIdA, "code-fixer");
    const stateB = makeJobState(jobIdB, "implementer");
    await seedJobState(jobIdA, stateA);
    await seedJobState(jobIdB, stateB);

    const events: string[] = [];

    // code-fixer always throws; implementer always succeeds.
    // This is deterministic regardless of FIFO order in the mutex chain.
    const strategy = makeStrategy({
      async finalizeStepArtifacts(step) {
        const name = (step as { name: string }).name;
        events.push(`enter:${name}`);
        if (name === "code-fixer") {
          throw Object.assign(new Error("commit failed"), { code: "COMMIT_AND_PUSH_FAILED" });
        }
        events.push(`exit:${name}`);
      },
    });

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    const deps = makeDeps(strategy);

    const [resultA, resultB] = await Promise.allSettled([
      executor.execute(makeStep("code-fixer"), stateA, deps),
      executor.execute(makeStep("implementer"), stateB, deps),
    ]);

    // code-fixer always fails due to commit error.
    expect(resultA.status).toBe("rejected");
    // implementer always ran its finalizeStepArtifacts (mutex chain continues after error).
    expect(events.some((e) => e === "enter:implementer")).toBe(true);
    // implementer completed successfully.
    expect(resultB.status).toBe("fulfilled");
  });
});
