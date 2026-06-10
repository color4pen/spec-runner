/**
 * Unit tests for StepExecutor verbose log instrumentation.
 *
 * TC-10-01: execute() → ログに "step started" と step フィールドが記録される
 * TC-10-02: execute() 正常終了 → ログに "step completed" が記録される
 * TC-10-03: execute() エラー → ログに "step error" と error フィールドが記録される
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import {
  setLogLevel,
  initVerboseLog,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../src/logger/stdout.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { Step } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "executor-verbose-log-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fsPromises.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId: string): JobState {
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

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    agents: {},
  };
}

async function setupJobState(jobId: string): Promise<JobState> {
  const jobsDir = path.join(tempDir, ".specrunner", "jobs");
  await fsPromises.mkdir(jobsDir, { recursive: true });
  const state = makeJobState(jobId);
  await fsPromises.writeFile(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(state, null, 2),
  );
  return state;
}

function makeSuccessRunner(): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
    },
  };
}

function makeFailingRunner(message: string): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      throw Object.assign(new Error(message), { code: "AGENT_STEP_FAILED" });
    },
  };
}

function makeAgentStep(name: string): Step {
  return {
    kind: "agent" as const,
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as "design",
      model: "claude-sonnet-4-5",
      system: `system for ${name}`,
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "test message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeDeps(): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" as const, mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" as const }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success" as const, total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

/**
 * Close verbose log and read all JSON Lines entries from the log file.
 * writeSync is synchronous so data is already on disk, but we close to be safe.
 */
function readLogEntries(logPath: string): Record<string, unknown>[] {
  closeVerboseLog();
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// TC-10-01: execute() — "step started" がログに記録される
// ---------------------------------------------------------------------------

describe("TC-10-01: StepExecutor.execute() — logs 'step started' with step field", () => {
  it("step 実行開始時にログに 'step started' エントリと step フィールドが書き出される", async () => {
    const jobId = "tc10-01-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    const state = await setupJobState(jobId);
    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    await executor.execute(makeAgentStep("spec-review"), state, makeDeps());

    const entries = readLogEntries(logPath);
    const startedEntry = entries.find((e) => e["message"] === "step started");
    expect(startedEntry).toBeDefined();
    expect(startedEntry!["step"]).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-10-02: execute() 正常終了 — "step completed" がログに記録される
// ---------------------------------------------------------------------------

describe("TC-10-02: StepExecutor.execute() — logs 'step completed' on success", () => {
  it("step が正常完了したとき 'step completed' エントリがログに書き出される", async () => {
    const jobId = "tc10-02-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    const state = await setupJobState(jobId);
    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    await executor.execute(makeAgentStep("spec-review"), state, makeDeps());

    const entries = readLogEntries(logPath);
    const completedEntry = entries.find((e) => e["message"] === "step completed");
    expect(completedEntry).toBeDefined();
    expect(completedEntry!["step"]).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-10-03: execute() エラー — "step error" と error フィールドがログに記録される
// ---------------------------------------------------------------------------

describe("TC-10-03: StepExecutor.execute() — logs 'step error' with error field on failure", () => {
  it("runner がエラーを throw したとき 'step error' エントリと error フィールドがログに書き出される", async () => {
    const jobId = "tc10-03-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    const state = await setupJobState(jobId);
    const executor = new StepExecutor(new EventBus(), makeFailingRunner("runner test error"), makeStoreFactory(tempDir));

    // execute() はエラーを re-throw する — その前に logVerbose("step", "step error", ...) が呼ばれる
    await expect(executor.execute(makeAgentStep("spec-review"), state, makeDeps())).rejects.toThrow();

    // writeSync は同期なのでデータはすでにディスクに書かれている
    const entries = readLogEntries(logPath);
    const errorEntry = entries.find((e) => e["message"] === "step error");
    expect(errorEntry).toBeDefined();
    expect(errorEntry!["step"]).toBe("spec-review");
    expect(typeof errorEntry!["error"]).toBe("string");
  });
});
