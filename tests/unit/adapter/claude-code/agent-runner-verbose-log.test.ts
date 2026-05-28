/**
 * Verbose log instrumentation tests for ClaudeCodeRunner (local runtime).
 *
 * TC-09-02: ClaudeCodeRunner.run() → ログに "query started" と runtime: "local" が記録される
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import {
  setLogLevel,
  initVerboseLog,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "agent-runner-verbose-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fsPromises.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
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
    runtime: "local",
    agents: {},
  };
}

function makeAgentStep(): AgentStep {
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
  };
}

function makeSuccessQueryFn(): QueryFn {
  return async function* () {
    yield {
      type: "result" as const,
      subtype: "success" as const,
      result: "done",
      duration_ms: 100,
      duration_api_ms: 80,
      is_error: false,
      num_turns: 1,
      stop_reason: "end_turn",
      total_cost_usd: 0.01,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
      uuid: "test-uuid",
      session_id: "test-session",
    } as unknown;
  } as QueryFn;
}

/**
 * Close verbose log and read all JSON Lines entries from the log file.
 * writeSync は同期なのでデータはすでにディスクにある。
 * close 後に logPath からファイルを読み込む。
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
// TC-09-02: local runtime (claude-code) で query 開始が記録される
// ---------------------------------------------------------------------------

describe("TC-09-02: ClaudeCodeRunner.run() — logs 'query started' with runtime: 'local'", () => {
  it("run() 開始時にログに 'query started' エントリと runtime: 'local' が書き出される", async () => {
    const jobId = "tc09-02-job";
    setLogLevel("verbose");
    initVerboseLog(tempDir, jobId);
    const logPath = getVerboseLogFilePath()!;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeSuccessQueryFn() });
    const ctx: AgentRunContext = {
      step: makeAgentStep(),
      state: makeJobState(),
      branch: "feat/test",
      slug: "test-slug",
      cwd: tempDir,
      input: { requestContent: "content" },
      session: {},
      policy: {},
      config: makeConfig(),
      emit: vi.fn(),
    };

    await runner.run(ctx);

    const entries = readLogEntries(logPath);
    const queryStartedEntry = entries.find((e) => e["message"] === "query started");
    expect(queryStartedEntry).toBeDefined();
    expect(queryStartedEntry!["runtime"]).toBe("local");
  });
});
