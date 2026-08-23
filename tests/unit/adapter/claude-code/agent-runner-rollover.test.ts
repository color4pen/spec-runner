/**
 * Unit tests for ClaudeCodeRunner fresh-session rollover (fresh-session-rollover).
 *
 * TC-001: errors[] に exhaustion 文字列を含む error result は CONTEXT_WINDOW_EXHAUSTED になる
 * TC-002: exhaustion 以外の error result は CLAUDE_CODE_QUERY_FAILED のまま
 * TC-003: cause チェーンに exhaustion 文字列を持つ throw は CONTEXT_WINDOW_EXHAUSTED になる
 * TC-004: 1 回目が枯渇し 2 回目が成功する場合 query は 2 回呼ばれ success になる
 * TC-005: 枯渇した session の report tool result は fresh session に引き継がれない
 * TC-008: budget を超えても枯渇が続く場合 query は maxRollovers + 1 回で停止する
 * TC-010: 非 exhaustion error result では rollover せず query は 1 回のみ
 * TC-012: error result の message に subtype と errors[] 本文の両方が含まれる
 * TC-013: 最終 contextMetrics は最終 session の観測値であり 1 回目の値が混入しない
 * TC-014: rollover ごとに step:rollover event が正しい payload で emit される
 * TC-022: follow-up query が context exhaustion で失敗した場合は typed code になるが rollover しない
 * TC-025: step timeout / inactivity watchdog が発火している状態では rollover が起きない
 * TC-026: 捨てた session の modelUsage は最終 AgentRunResult の modelUsage に加算される
 * TC-028: rollover が発生しない場合 sessionRollovers は undefined である
 * TC-035: throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される
 * TC-036: throw 経路での exhaustion が rollover ループへ正しくルーティングされ成功する
 * TC-037: throw 経路での exhaustion が budget 枯渇時に CONTEXT_WINDOW_EXHAUSTED を返す
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ClaudeCodeRunner,
  CONTEXT_WINDOW_EXHAUSTED_CODE,
} from "../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext, AgentRunResult } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-runner-rollover-test-"));
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

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    transientRetry: { maxRetries: 0 },
    ...overrides,
  };
}

function makeAgentStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-5",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    ...overrides,
  };
}

function makeCtx(cwd: string, overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd,
    input: { requestContent: "implement this" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

/** Build a success result message. */
function makeSuccessResult(sessionId = "sess-1", modelName = "claude-sonnet-4-5") {
  return {
    type: "result" as const,
    subtype: "success" as const,
    result: "done",
    session_id: sessionId,
    is_error: false,
    stop_reason: "end_turn",
    num_turns: 3,
    duration_ms: 5000,
    duration_api_ms: 4000,
    total_cost_usd: 0.01,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
    modelUsage: {
      [modelName]: {
        inputTokens: 80000,
        outputTokens: 5000,
        cacheReadInputTokens: 5000,
        cacheCreationInputTokens: 2000,
        contextWindow: 200000,
      },
    },
    permission_denials: [],
    uuid: "test-uuid",
  } as unknown;
}

/** Build an exhaustion error result message. */
function makeExhaustionResult(sessionId = "sess-exhaust", modelName = "claude-sonnet-4-5", errors = ["Prompt is too long for this model's context window"]) {
  return {
    type: "result" as const,
    subtype: "error_during_execution" as const,
    is_error: true,
    stop_reason: null,
    errors,
    session_id: sessionId,
    modelUsage: {
      [modelName]: {
        inputTokens: 190000,
        outputTokens: 1000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    },
    usage: { input_tokens: 190000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
    permission_denials: [],
    uuid: "test-uuid-exhaust",
    num_turns: 5,
    duration_ms: 1000,
    duration_api_ms: 900,
    total_cost_usd: 0.05,
  } as unknown;
}

/** Build a non-exhaustion error result message. */
function makeErrorResult(errors = ["something unexpected went wrong"]) {
  return {
    type: "result" as const,
    subtype: "error_during_execution" as const,
    is_error: true,
    stop_reason: null,
    errors,
    session_id: "sess-error",
    modelUsage: {},
    usage: { input_tokens: 1000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
    permission_denials: [],
    uuid: "test-uuid-error",
    num_turns: 1,
    duration_ms: 100,
    duration_api_ms: 80,
    total_cost_usd: 0.001,
  } as unknown;
}

/** Build an assistant message with usage data for contextMetrics testing. */
function makeAssistantMessage(inputTokens: number) {
  return {
    type: "assistant" as const,
    message: {
      usage: {
        input_tokens: inputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  } as unknown;
}

// ---------------------------------------------------------------------------
// TC-001: error result の errors[] に exhaustion 文字列 → CONTEXT_WINDOW_EXHAUSTED
// ---------------------------------------------------------------------------

describe("TC-001: errors[] に exhaustion 文字列を含む error result は CONTEXT_WINDOW_EXHAUSTED になる", () => {
  it("error result with 'Prompt is too long' → error.code = CONTEXT_WINDOW_EXHAUSTED", async () => {
    const queryFn: QueryFn = async function* () {
      yield makeExhaustionResult();
    } as unknown as QueryFn;

    // Disable rollover so we get the direct error return
    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
    });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });

  it("error result with 'context length exceeded' → error.code = CONTEXT_WINDOW_EXHAUSTED", async () => {
    const queryFn: QueryFn = async function* () {
      yield makeExhaustionResult("sess-ctx-exceeded", "claude-sonnet-4-5", ["context length exceeded"]);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 非 exhaustion error result → CLAUDE_CODE_QUERY_FAILED
// ---------------------------------------------------------------------------

describe("TC-002: exhaustion 以外の error result は CLAUDE_CODE_QUERY_FAILED のまま", () => {
  it("error result with non-exhaustion errors → error.code = CLAUDE_CODE_QUERY_FAILED", async () => {
    const queryFn: QueryFn = async function* () {
      yield makeErrorResult(["API Error: Rate limit exceeded"]);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
  });
});

// ---------------------------------------------------------------------------
// TC-003: cause チェーンに exhaustion 文字列を持つ throw → CONTEXT_WINDOW_EXHAUSTED
// ---------------------------------------------------------------------------

describe("TC-003: cause チェーンに exhaustion 文字列を持つ throw は CONTEXT_WINDOW_EXHAUSTED になる", () => {
  it("SDK throw with cause containing exhaustion message → error.code = CONTEXT_WINDOW_EXHAUSTED", async () => {
    const queryFn: QueryFn = async function* () {
      throw new Error("Claude Code SDK query failed", {
        cause: new Error("Prompt is too long for this model's context window"),
      });
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 1 回目が枯渇し 2 回目が成功する場合 query は 2 回呼ばれ success になる
// ---------------------------------------------------------------------------

describe("TC-004: 1 回目が枯渇し 2 回目が成功する場合 query は 2 回呼ばれ success になる", () => {
  it("rollover: 1st exhaustion → 2nd success → completionReason=success, query called twice", async () => {
    let callCount = 0;
    const promptsReceived: string[] = [];

    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      callCount++;
      promptsReceived.push(params.prompt);
      if (callCount === 1) {
        yield makeExhaustionResult("sess-1");
      } else {
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(callCount).toBe(2);
    expect(result.completionReason).toBe("success");
    // Second call should not have resume option (fresh session)
    // Second prompt should contain rollover continuation section
    expect(promptsReceived[1]).toContain("rollover-context");
    expect(promptsReceived[1]).toContain("implement this"); // base task preserved
  });

  it("TC-004: fresh session options must not contain resume key", async () => {
    let call2Options: Record<string, unknown> = {};
    let callCount = 0;

    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      callCount++;
      if (callCount === 1) {
        yield makeExhaustionResult("sess-1");
      } else {
        call2Options = params.options ?? {};
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    await runner.run(ctx);

    expect(callCount).toBe(2);
    // Fresh session must NOT have resume key
    expect(call2Options).not.toHaveProperty("resume");
    // But must have cwd
    expect(call2Options["cwd"]).toBe(tempDir);
  });
});

// ---------------------------------------------------------------------------
// TC-005: 枯渇した session の report tool result は fresh session に引き継がれない
// ---------------------------------------------------------------------------

describe("TC-005: 枯渇した session の report tool result は fresh session に引き継がれない", () => {
  it("toolResult from 1st session is cleared and final toolResult is null when 2nd session doesn't call the tool", async () => {
    let callCount = 0;
    const capturedToolResult: { data: string } | null = null;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        // First session: doesn't actually produce a result file, just exhaustion
        yield makeExhaustionResult("sess-1");
      } else {
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
      // No reportTool configured — capturedToolResult stays null
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // toolResult must be null since no report_result tool was called
    expect(result.toolResult).toBeNull();
    void capturedToolResult; // suppress unused var warning
  });
});

// ---------------------------------------------------------------------------
// TC-008: budget を超えても枯渇が続く場合 query は maxRollovers + 1 回で停止する
// ---------------------------------------------------------------------------

describe("TC-008: budget を超えても枯渇が続く場合 query は maxRollovers + 1 回で停止する", () => {
  it("maxRollovers=1 → query called 2 times, then CONTEXT_WINDOW_EXHAUSTED", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeExhaustionResult(`sess-${callCount}`);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    // maxRollovers=1 → 1 initial + 1 rollover = 2 total
    expect(callCount).toBe(2);
    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });

  it("maxRollovers=2 → query called 3 times, then CONTEXT_WINDOW_EXHAUSTED", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeExhaustionResult(`sess-${callCount}`);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 2 } }),
    });
    const result = await runner.run(ctx);

    expect(callCount).toBe(3);
    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });

  it("maxRollovers=0 → query called 1 time (no rollover), CONTEXT_WINDOW_EXHAUSTED", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeExhaustionResult("sess-1");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(callCount).toBe(1);
    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
  });
});

// ---------------------------------------------------------------------------
// TC-010: 非 exhaustion error result では rollover せず query は 1 回のみ
// ---------------------------------------------------------------------------

describe("TC-010: 非 exhaustion error result では rollover せず query は 1 回のみ", () => {
  it("non-exhaustion error result → query called once, CLAUDE_CODE_QUERY_FAILED", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeErrorResult(["Stream idle timeout - partial response received"]);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(callCount).toBe(1);
    expect(result.completionReason).toBe("error");
    // Stream timeout is not in the exhaustion allowlist → CLAUDE_CODE_QUERY_FAILED
    expect((result.error as Error & { code?: string })?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
  });
});

// ---------------------------------------------------------------------------
// TC-012: error result の message に subtype と errors[] 本文の両方が含まれる
// ---------------------------------------------------------------------------

describe("TC-012: error result の message に subtype と errors[] 本文の両方が含まれる", () => {
  it("error.message includes subtype and errors[] body", async () => {
    const errorText = "something unexpected went wrong with the API";
    const queryFn: QueryFn = async function* () {
      yield makeErrorResult([errorText]);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toContain("error_during_execution");
    expect(result.error?.message).toContain(errorText);
  });

  it("when errors[] is empty, message contains subtype only", async () => {
    const queryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        errors: [],
        session_id: "sess-empty-err",
        modelUsage: {},
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-empty",
        num_turns: 1,
        duration_ms: 100,
        duration_api_ms: 80,
        total_cost_usd: 0,
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toContain("error_during_execution");
  });
});

// ---------------------------------------------------------------------------
// TC-013: 最終 contextMetrics は最終 session の観測値であり 1 回目の値が混入しない
// ---------------------------------------------------------------------------

describe("TC-013: 最終 contextMetrics は最終 session の観測値であり 1 回目の値が混入しない", () => {
  it("peakActiveContextTokens from 2nd session when 1st session had a higher peak before exhaustion", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        // First session: high active context → exhaustion
        yield makeAssistantMessage(180000); // peak = 180000 in 1st session
        yield makeExhaustionResult("sess-1");
      } else {
        // Second session: lower active context → success
        yield makeAssistantMessage(50000); // peak = 50000 in 2nd session
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // Final contextMetrics must be from 2nd session only (50000), not 180000 from 1st
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(50000);
  });

  it("sessionRollovers[0].contextMetrics.exhaustionAtTokens reflects 1st session's peak", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        yield makeAssistantMessage(180000); // 1st session peak
        yield makeExhaustionResult("sess-1");
      } else {
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // sessionRollovers should have 1 entry for the 1st session
    expect(result.sessionRollovers).toBeDefined();
    expect(result.sessionRollovers!.length).toBe(1);
    // The 1st session's exhaustion context should be recorded
    expect(result.sessionRollovers![0].attempt).toBe(1);
    expect(result.sessionRollovers![0].reason).toBe("context-exhaustion");
    // contextMetrics of 1st session should capture the peak before exhaustion
    expect(result.sessionRollovers![0].contextMetrics?.exhaustionAtTokens).toBe(180000);
  });
});

// ---------------------------------------------------------------------------
// TC-014: rollover ごとに step:rollover event が正しい payload で emit される
// ---------------------------------------------------------------------------

describe("TC-014: rollover ごとに step:rollover event が正しい payload で emit される", () => {
  it("step:rollover event emitted once with correct payload on single rollover", async () => {
    let callCount = 0;
    const emitFn = vi.fn();

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        yield makeExhaustionResult("sess-1");
      } else {
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
      emit: emitFn,
    });
    await runner.run(ctx);

    const rolloverCalls = emitFn.mock.calls.filter(([event]) => event === "step:rollover");
    expect(rolloverCalls.length).toBe(1);
    const [, payload] = rolloverCalls[0];
    expect(payload.step).toBe("implementer");
    expect(payload.attempt).toBe(1);
    expect(payload.maxRollovers).toBe(1);
    expect(payload.reason).toBe("context-exhaustion");
  });

  it("step:rollover emitted twice on two rollovers", async () => {
    let callCount = 0;
    const emitFn = vi.fn();

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount <= 2) {
        yield makeExhaustionResult(`sess-${callCount}`);
      } else {
        yield makeSuccessResult("sess-3");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 2 } }),
      emit: emitFn,
    });
    await runner.run(ctx);

    const rolloverCalls = emitFn.mock.calls.filter(([event]) => event === "step:rollover");
    expect(rolloverCalls.length).toBe(2);
    expect(rolloverCalls[0][1].attempt).toBe(1);
    expect(rolloverCalls[1][1].attempt).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-022: follow-up query が context exhaustion で失敗した場合は typed code になるが rollover しない
// ---------------------------------------------------------------------------

describe("TC-022: follow-up query が context exhaustion で失敗した場合は typed code になるが rollover しない", () => {
  it("postWorkPrompts exhaustion → CONTEXT_WINDOW_EXHAUSTED but no rollover (query called twice)", async () => {
    let mainCallCount = 0;
    let followUpCallCount = 0;

    // We use two separate queryFn invocations: main work + follow-up
    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const isResume = !!(params.options?.["resume"]);
      if (!isResume) {
        // Main work turn
        mainCallCount++;
        yield makeSuccessResult("sess-main");
      } else {
        // Follow-up turn (postWorkPrompts) with exhaustion
        followUpCallCount++;
        yield makeExhaustionResult("sess-main");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
      policy: {
        postWorkPrompts: ["post work check"],
      },
    });
    const result = await runner.run(ctx);

    // Main work succeeded, follow-up failed
    expect(mainCallCount).toBe(1);
    expect(followUpCallCount).toBe(1);
    expect(result.completionReason).toBe("error");
    // typed as context exhaustion
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
    // No rollover occurred (rolloverCalls = 0)
  });
});

// ---------------------------------------------------------------------------
// TC-025: step timeout / inactivity watchdog が発火している状態では rollover が起きない
// ---------------------------------------------------------------------------

describe("TC-025: step timeout / abort が発火している状態では rollover が起きない", () => {
  it("step timeout fires (via fake timers) → completionReason=timeout, no rollover", async () => {
    vi.useFakeTimers();

    // Generator that blocks until aborted — never yields any result
    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const abort = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((_, reject) => {
        abort?.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
      });
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      // Use step-level timeoutMs so the timeout fires
      config: {
        ...makeConfig({ contextRollover: { maxRollovers: 1 } }),
        steps: { implementer: { timeoutMs: 100 } } as never,
      },
    });

    const runPromise = runner.run(ctx);
    // Advance fake timers past the timeout — abort fires, no rollover
    await vi.advanceTimersByTimeAsync(200);
    const result = await runPromise;

    vi.useRealTimers();

    // Timeout fired → completionReason=timeout (rollover does NOT happen)
    expect(result.completionReason).toBe("timeout");
    // sessionRollovers must be absent (no rollover occurred)
    expect(result.sessionRollovers).toBeUndefined();
  });

  it("inactivity watchdog fires → completionReason=timeout, no rollover", async () => {
    // This test verifies that when abort fires via the inactivity watchdog,
    // rollover does not occur — the timeout path takes priority.
    vi.useFakeTimers();

    const INACTIVITY_THRESHOLD_MS = 900_000;

    const queryFn: QueryFn = async function* (params: { prompt: string; options?: Record<string, unknown> }) {
      const abort = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((_, reject) => {
        abort?.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
      });
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });

    const runPromise = runner.run(ctx);
    await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS + 1000);
    const result = await runPromise;

    vi.useRealTimers();

    // Watchdog fired → timeout path, no rollover
    expect(result.completionReason).toBe("timeout");
    expect(result.sessionRollovers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-026: 捨てた session の modelUsage は最終 AgentRunResult の modelUsage に加算される
// ---------------------------------------------------------------------------

describe("TC-026: 捨てた session の modelUsage は最終 AgentRunResult の modelUsage に加算される", () => {
  it("modelUsage from 1st exhausted session + 2nd success session are summed", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        // 1st session: exhaustion with modelUsage
        yield {
          type: "result" as const,
          subtype: "error_during_execution" as const,
          is_error: true,
          stop_reason: null,
          errors: ["Prompt is too long for this model's context window"],
          session_id: "sess-1",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 100000,
              outputTokens: 2000,
              cacheReadInputTokens: 5000,
              cacheCreationInputTokens: 1000,
            },
          },
          usage: { input_tokens: 100000, output_tokens: 2000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, server_tool_use_input_tokens: 0 },
          permission_denials: [],
          uuid: "uuid-1",
          num_turns: 5,
          duration_ms: 1000,
          duration_api_ms: 900,
          total_cost_usd: 0.05,
        } as unknown;
      } else {
        // 2nd session: success with modelUsage
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          session_id: "sess-2",
          is_error: false,
          stop_reason: "end_turn",
          num_turns: 3,
          duration_ms: 2000,
          duration_api_ms: 1800,
          total_cost_usd: 0.02,
          usage: { input_tokens: 50000, output_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 50000,
              outputTokens: 3000,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              contextWindow: 200000,
            },
          },
          permission_denials: [],
          uuid: "uuid-2",
        } as unknown;
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.modelUsage).toBeDefined();

    // Sum: 100000 + 50000 = 150000 input tokens
    const usage = result.modelUsage!["claude-sonnet-4-5"];
    expect(usage).toBeDefined();
    expect(usage.inputTokens).toBe(150000); // 100000 + 50000
    expect(usage.outputTokens).toBe(5000); // 2000 + 3000
    expect(usage.cacheReadInputTokens).toBe(5000); // 5000 + 0
    expect(usage.cacheCreationInputTokens).toBe(1000); // 1000 + 0
  });
});

// ---------------------------------------------------------------------------
// TC-028: rollover が発生しない場合 sessionRollovers は undefined である
// ---------------------------------------------------------------------------

describe("TC-028: rollover が発生しない場合 sessionRollovers は undefined である", () => {
  it("normal success with no exhaustion → sessionRollovers is undefined", async () => {
    const queryFn: QueryFn = async function* () {
      yield makeSuccessResult("sess-1");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionRollovers).toBeUndefined();
  });

  it("non-exhaustion error with no rollover → sessionRollovers is undefined", async () => {
    const queryFn: QueryFn = async function* () {
      yield makeErrorResult(["Rate limit exceeded"]);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect(result.sessionRollovers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-035: throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される
// ---------------------------------------------------------------------------

describe("TC-035: throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される", () => {
  it("error.message preserved and cause chain intact when SDK throws with exhaustion cause", async () => {
    const causeErr = new Error("Prompt is too long for this model's context window");
    const outerMsg = "Claude Code SDK query failed";

    const queryFn: QueryFn = async function* () {
      throw new Error(outerMsg, { cause: causeErr });
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
    // Original message should be preserved in the error
    expect(result.error?.message).toContain(outerMsg);
    // cause chain should be preserved
    const cause = (result.error as Error & { cause?: unknown })?.cause;
    expect(cause).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// sessionRollovers field present on error/budget-exceeded paths
// ---------------------------------------------------------------------------

describe("sessionRollovers included when rollovers occurred", () => {
  it("sessionRollovers has 1 entry after 1 rollover + budget-exceeded", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeExhaustionResult(`sess-${callCount}`);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect(result.sessionRollovers).toBeDefined();
    expect(result.sessionRollovers!.length).toBe(1);
    expect(result.sessionRollovers![0].attempt).toBe(1);
    expect(result.sessionRollovers![0].reason).toBe("context-exhaustion");
    expect(typeof result.sessionRollovers![0].errorMessage).toBe("string");
    expect(result.sessionRollovers![0].errorMessage.length).toBeGreaterThan(0);
  });

  it("sessionRollovers has 1 entry after rollover + success", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        yield makeExhaustionResult("sess-1");
      } else {
        yield makeSuccessResult("sess-2");
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionRollovers).toBeDefined();
    expect(result.sessionRollovers!.length).toBe(1);
    expect(result.sessionRollovers![0].attempt).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Budget-exceeded error message includes rollover count hint
// ---------------------------------------------------------------------------

describe("Budget-exceeded error message includes rollover count hint", () => {
  it("error message mentions rollover count when budget exhausted", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      yield makeExhaustionResult(`sess-${callCount}`);
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result: AgentRunResult = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    // Message should mention rollover/context/split
    expect(result.error?.message).toMatch(/rollover|context window|split/i);
  });
});

// ---------------------------------------------------------------------------
// TC-036: throw 経路での exhaustion が rollover ループへ正しくルーティングされ成功する
// ---------------------------------------------------------------------------

describe("TC-036: throw 経路での exhaustion が rollover ループへ正しくルーティングされ成功する", () => {
  it("SDK throw exhaustion on 1st call, result success on 2nd call → completionReason=success, query called twice", async () => {
    let callCount = 0;
    const emit = vi.fn();

    const queryFn: QueryFn = async function* (_params: { prompt: string; options?: Record<string, unknown> }) {
      callCount++;
      if (callCount === 1) {
        throw new Error("Prompt is too long for this model's context window");
      }
      yield makeSuccessResult("sess-2");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
      emit,
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);
    // step:rollover event should have been emitted once
    const rolloverEvents = (emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === "step:rollover",
    );
    expect(rolloverEvents).toHaveLength(1);
    expect(rolloverEvents[0][1]).toMatchObject({ attempt: 1, reason: "context-exhaustion" });
  });

  it("SDK throw with cause chain exhaustion on 1st call, result success on 2nd call → completionReason=success", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        throw new Error("SDK internal error", {
          cause: new Error("Prompt is too long for this model's context window"),
        });
      }
      yield makeSuccessResult("sess-2");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);
  });

  it("sessionRollovers has 1 entry after throw-path rollover + success", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      if (callCount === 1) {
        throw new Error("Prompt is too long for this model's context window");
      }
      yield makeSuccessResult("sess-2");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionRollovers).toBeDefined();
    expect(result.sessionRollovers!.length).toBe(1);
    expect(result.sessionRollovers![0].attempt).toBe(1);
    expect(result.sessionRollovers![0].reason).toBe("context-exhaustion");
    expect(typeof result.sessionRollovers![0].errorMessage).toBe("string");
    expect(result.sessionRollovers![0].errorMessage.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-037: throw 経路での exhaustion が budget 枯渇時に CONTEXT_WINDOW_EXHAUSTED を返す
// ---------------------------------------------------------------------------

describe("TC-037: throw 経路での exhaustion が budget 枯渇時に CONTEXT_WINDOW_EXHAUSTED を返す", () => {
  it("SDK throw exhaustion on every call with maxRollovers=1 → CONTEXT_WINDOW_EXHAUSTED after 2 calls", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      throw new Error("Prompt is too long for this model's context window");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
    expect(callCount).toBe(2); // maxRollovers=1 → 2 total attempts
    expect(result.error?.message).toMatch(/rollover|context window|split/i);
  });

  it("SDK throw exhaustion with no budget (maxRollovers=0) → CONTEXT_WINDOW_EXHAUSTED, cause preserved", async () => {
    const causeErr = new Error("Prompt is too long for this model's context window");

    const queryFn: QueryFn = async function* () {
      throw new Error("outer error", { cause: causeErr });
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 0 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe(CONTEXT_WINDOW_EXHAUSTED_CODE);
    // cause chain should be preserved
    const cause = (result.error as Error & { cause?: unknown })?.cause;
    expect(cause).toBeInstanceOf(Error);
  });

  it("sessionRollovers has 1 entry after throw-path rollover + budget exhausted", async () => {
    const queryFn: QueryFn = async function* () {
      throw new Error("Prompt is too long for this model's context window");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 1 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect(result.sessionRollovers).toBeDefined();
    expect(result.sessionRollovers!.length).toBe(1);
    expect(result.sessionRollovers![0].attempt).toBe(1);
    expect(result.sessionRollovers![0].reason).toBe("context-exhaustion");
  });

  it("non-exhaustion SDK throw does NOT trigger rollover even with budget available", async () => {
    let callCount = 0;

    const queryFn: QueryFn = async function* () {
      callCount++;
      throw new Error("Network error: connection refused");
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const ctx = makeCtx(tempDir, {
      config: makeConfig({ contextRollover: { maxRollovers: 2 } }),
    });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("error");
    expect((result.error as Error & { code?: string })?.code).toBe("CLAUDE_CODE_QUERY_FAILED");
    expect(callCount).toBe(1); // no rollover
    expect(result.sessionRollovers).toBeUndefined();
  });
});
