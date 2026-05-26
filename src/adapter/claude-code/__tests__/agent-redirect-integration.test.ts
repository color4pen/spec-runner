/**
 * Integration tests for agent redirect handling in ClaudeCodeRunner.
 *
 * TC-AR-01: disallowedTools is present in queryOptions
 * TC-AR-02: 4+ Agent tool calls → AGENT_REDIRECT_LIMIT_EXCEEDED
 * TC-AR-03: Normal tools (Read, Bash) don't trigger the counter
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-redirect-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
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

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-6",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    ...overrides,
  };
}

function makeCtx(step: AgentStep, state: JobState): AgentRunContext {
  return {
    step,
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    requestContent: "test request",
    requestAdr: false,
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  };
}

/**
 * Create a stream that yields tool_use events for the given tool names,
 * then a success result.
 */
async function* toolUseStream(toolNames: string[]): AsyncGenerator<unknown, void> {
  for (const name of toolNames) {
    yield {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name, input: {} },
      },
    };
  }
  yield {
    type: "result",
    subtype: "success",
    result: "done",
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: false,
    num_turns: 1,
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "test-uuid",
    session_id: "test-session",
  };
}

describe("TC-AR-01: disallowedTools in queryOptions", () => {
  it("queryOptions contains disallowedTools: ['Agent', 'Task']", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = async function* (params) {
      capturedOptions = params.options;
      yield {
        type: "result",
        subtype: "success",
        result: "done",
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc-ar-01");
    await runner.run(makeCtx(makeAgentStep(), state));

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!["disallowedTools"]).toEqual(["Agent", "Task"]);
  });
});

describe("TC-AR-02: Agent tool redirect limit exceeded", () => {
  it("4+ Agent tool_use events → completionReason=error, code=AGENT_REDIRECT_LIMIT_EXCEEDED", async () => {
    // Emit 4 Agent tool calls (exceeds limit of 3)
    const agentToolNames = ["Agent", "Agent", "Agent", "Agent"];

    const queryFn: QueryFn = async function* (params) {
      yield* toolUseStream(agentToolNames) as AsyncGenerator<unknown>;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc-ar-02");
    const result = await runner.run(makeCtx(makeAgentStep(), state));

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe("AGENT_REDIRECT_LIMIT_EXCEEDED");
    expect(result.error?.message).toContain("Agent/Task tool redirect limit exceeded");
  });

  it("exactly 3 Agent tool_use events → does NOT trigger limit (count === 3, not > 3)", async () => {
    // 3 Agent calls should NOT exceed the limit (limit is > 3)
    const agentToolNames = ["Agent", "Agent", "Agent"];

    const queryFn: QueryFn = async function* (params) {
      yield* toolUseStream(agentToolNames) as AsyncGenerator<unknown>;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc-ar-02b");
    const result = await runner.run(makeCtx(makeAgentStep(), state));

    // Should succeed (or fail for another reason — not AGENT_REDIRECT_LIMIT_EXCEEDED)
    const code = (result.error as Error & { code?: string })?.code;
    expect(code).not.toBe("AGENT_REDIRECT_LIMIT_EXCEEDED");
  });
});

describe("TC-AR-03: Normal tools don't trigger redirect counter", () => {
  it("Read, Bash, Grep tool_use events → no redirect limit triggered", async () => {
    const normalTools = ["Read", "Bash", "Grep", "Edit", "Write", "Glob"];

    const queryFn: QueryFn = async function* (params) {
      yield* toolUseStream(normalTools) as AsyncGenerator<unknown>;
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const state = makeJobState("tc-ar-03");
    const result = await runner.run(makeCtx(makeAgentStep(), state));

    const code = (result.error as Error & { code?: string })?.code;
    expect(code).not.toBe("AGENT_REDIRECT_LIMIT_EXCEEDED");
    expect(result.completionReason).toBe("success");
  });
});
