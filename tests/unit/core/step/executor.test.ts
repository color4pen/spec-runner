/**
 * Unit tests for StepExecutor — resumePrompt one-shot consumption (T-10b)
 *
 * TC-EXEC-001: deps.resumePrompt が設定されているとき、最初の AgentRunContext.resumePrompt に値が入る
 * TC-EXEC-002: 最初の agent step 実行後、deps.resumePrompt が undefined になる
 * TC-EXEC-003: 2 回目以降の agent step では ctx.resumePrompt が undefined になる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { JobStateStore } from "../../../../src/store/job-state-store.js";
import type { AgentRunner, AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { AgentStepName } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-resume-prompt-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// SpawnFn from util/spawn for PipelineDeps.spawn
const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    // Use "managed" to skip git operations in StepExecutor (commitAndPush only runs for "local")
    runtime: "managed",
    agents: {},
  };
}

const IMPLEMENTER_ROLE = "implementer" as AgentStepName;

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: IMPLEMENTER_ROLE,
      model: "claude-sonnet-4-5",
      system: "do the work",
      tools: [],
    },
    buildMessage: () => "do the thing",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

async function createRunningJobState(): Promise<JobState> {
  const created = await JobStateStore.create(tempDir, {
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "owner", name: "repo" },
  });

  const store = new JobStateStore(created.jobId, tempDir);
  const running: JobState = {
    ...created,
    status: "running",
    branch: "feat/test-slug",
  };
  await store.persist(running);
  return running;
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    config: makeConfig(),
    slug: "test-slug",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "# Test\n",
      adr: false,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
    ...overrides,
  };
}

/**
 * Create a mock AgentRunner that captures the AgentRunContext passed to run().
 * Returns success with no result content.
 */
function makeCapturingRunner(): { runner: AgentRunner; capturedCtxList: AgentRunContext[] } {
  const capturedCtxList: AgentRunContext[] = [];
  const runner: AgentRunner = {
    run: vi.fn().mockImplementation(async (ctx: AgentRunContext) => {
      capturedCtxList.push({ ...ctx }); // shallow copy to capture snapshot
      return { completionReason: "success" as const, resultContent: null };
    }),
  };
  return { runner, capturedCtxList };
}

// ---------------------------------------------------------------------------
// TC-EXEC-001: deps.resumePrompt が設定されているとき、ctx.resumePrompt に値が入る
// ---------------------------------------------------------------------------

describe("TC-EXEC-001: deps.resumePrompt が設定されているとき、ctx.resumePrompt に値が入る", () => {
  it("runner.run() の呼び出しで ctx.resumePrompt が deps.resumePrompt の値を持つ", async () => {
    const jobState = await createRunningJobState();
    const { runner, capturedCtxList } = makeCapturingRunner();

    // StepExecutor — spawnFn is omitted (optional); runtime="managed" skips git/commit ops
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const deps = makeDeps({ resumePrompt: "手動で foo.ts の import を修正済み" });
    const step = makeAgentStep();

    await executor.execute(step, jobState, deps);

    expect(capturedCtxList).toHaveLength(1);
    expect(capturedCtxList[0]!.resumePrompt).toBe("手動で foo.ts の import を修正済み");
  });
});

// ---------------------------------------------------------------------------
// TC-EXEC-002: 最初の agent step 実行後、deps.resumePrompt が undefined になる
// ---------------------------------------------------------------------------

describe("TC-EXEC-002: 最初の agent step 実行後、deps.resumePrompt が undefined になる", () => {
  it("executor.execute() 後に deps.resumePrompt が undefined になる", async () => {
    const jobState = await createRunningJobState();
    const { runner } = makeCapturingRunner();

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const deps = makeDeps({ resumePrompt: "前回の review feedback を強調" });
    const step = makeAgentStep();

    expect(deps.resumePrompt).toBe("前回の review feedback を強調");
    await executor.execute(step, jobState, deps);
    expect(deps.resumePrompt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-EXEC-003: 2 回目以降の agent step では ctx.resumePrompt が undefined になる
// ---------------------------------------------------------------------------

describe("TC-EXEC-003: 2 回目以降の agent step では ctx.resumePrompt が undefined になる", () => {
  it("2 回目の executor.execute() 呼び出しでは ctx.resumePrompt が undefined", async () => {
    const jobState = await createRunningJobState();
    const { runner, capturedCtxList } = makeCapturingRunner();

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const deps = makeDeps({ resumePrompt: "first time context" });
    const step = makeAgentStep();

    // First execute: resumePrompt should be passed and then cleared
    const state1 = await executor.execute(step, jobState, deps);

    // Second execute: resumePrompt should be undefined in ctx
    await executor.execute(step, state1, deps);

    expect(capturedCtxList).toHaveLength(2);
    expect(capturedCtxList[0]!.resumePrompt).toBe("first time context");
    expect(capturedCtxList[1]!.resumePrompt).toBeUndefined();
  });

  it("resumePrompt が未設定のとき、ctx.resumePrompt は常に undefined", async () => {
    const jobState = await createRunningJobState();
    const { runner, capturedCtxList } = makeCapturingRunner();

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    // No resumePrompt in deps
    const deps = makeDeps();
    const step = makeAgentStep();

    await executor.execute(step, jobState, deps);

    expect(capturedCtxList).toHaveLength(1);
    expect(capturedCtxList[0]!.resumePrompt).toBeUndefined();
  });
});
