/**
 * Unit tests for ClaudeCodeRunner — invocation metrics extraction from SDK results.
 *
 * TC-001: success result から 4 metrics を抽出する
 * TC-002: error subtype の result からも 4 metrics を抽出する
 * TC-003: 欠落フィールドは undefined になる
 * TC-018: extractInvocationMetrics が非 number 型値を undefined として扱う
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-runner-metrics-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeJobState(jobId = "test-job", branch = "feat/test"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch,
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

function makeCtx(cwd: string, overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd,
    input: { requestContent: "content" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-001: success result から 4 metrics を抽出する
// ---------------------------------------------------------------------------

describe("TC-001: success result から 4 metrics を抽出する", () => {
  it("returns invocationMetrics with all 4 values when SDK success result contains them", async () => {
    const metricsQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-1",
        num_turns: 7,
        duration_ms: 12000,
        duration_api_ms: 9500,
        total_cost_usd: 0.042,
        modelUsage: {},
        is_error: false,
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: metricsQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    // TC-001: 4 values must be extracted from success result
    // These assertions will FAIL until implementation adds invocationMetrics to AgentRunResult
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBe(7);
    expect(result.invocationMetrics!.durationMs).toBe(12000);
    expect(result.invocationMetrics!.durationApiMs).toBe(9500);
    expect(result.invocationMetrics!.totalCostUsd).toBe(0.042);
  });
});

// ---------------------------------------------------------------------------
// TC-002: error subtype の result からも 4 metrics を抽出する
// ---------------------------------------------------------------------------

describe("TC-002: error subtype の result からも 4 metrics を抽出する", () => {
  it("returns invocationMetrics with all 4 values when SDK error result contains them", async () => {
    const errorMetricsQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        num_turns: 3,
        duration_ms: 5000,
        duration_api_ms: 4000,
        total_cost_usd: 0.015,
        modelUsage: {},
        usage: { input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        errors: ["something went wrong"],
        uuid: "test-uuid-err",
        session_id: "sess-err",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: errorMetricsQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    // The result should be an error
    expect(result.completionReason).toBe("error");

    // TC-002: 4 values must also be extracted from error results
    // These assertions will FAIL until implementation adds invocationMetrics to the error return path
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBe(3);
    expect(result.invocationMetrics!.durationMs).toBe(5000);
    expect(result.invocationMetrics!.durationApiMs).toBe(4000);
    expect(result.invocationMetrics!.totalCostUsd).toBe(0.015);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 欠落フィールドは undefined になる
// ---------------------------------------------------------------------------

describe("TC-003: 欠落フィールドは undefined になる", () => {
  it("invocationMetrics fields are undefined (not 0 or null) when SDK result omits them", async () => {
    const noMetricsQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-no-metrics",
        // No num_turns, duration_ms, duration_api_ms, total_cost_usd
        modelUsage: {},
        is_error: false,
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-none",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: noMetricsQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");

    // TC-003: invocationMetrics must exist but all 4 fields are undefined (NOT 0, NOT null)
    // This will FAIL until implementation creates invocationMetrics object
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBeUndefined();
    expect(result.invocationMetrics!.durationMs).toBeUndefined();
    expect(result.invocationMetrics!.durationApiMs).toBeUndefined();
    expect(result.invocationMetrics!.totalCostUsd).toBeUndefined();

    // Verify it's not 0 or null (the key invariant)
    expect(result.invocationMetrics!.numTurns).not.toBe(0);
    expect(result.invocationMetrics!.numTurns).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-018: extractInvocationMetrics が非 number 型値を undefined として扱う
// ---------------------------------------------------------------------------

describe("TC-018: extractInvocationMetrics handles non-number type values as undefined", () => {
  it("sets fields to undefined when SDK result provides null values for metrics", async () => {
    const nullValuesQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-nulls",
        num_turns: null,
        duration_ms: null,
        duration_api_ms: null,
        total_cost_usd: null,
        modelUsage: {},
        is_error: false,
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-nulls",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: nullValuesQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    // TC-018: null values must be treated as undefined (not 0, not null)
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBeUndefined();
    expect(result.invocationMetrics!.durationMs).toBeUndefined();
    expect(result.invocationMetrics!.durationApiMs).toBeUndefined();
    expect(result.invocationMetrics!.totalCostUsd).toBeUndefined();
  });

  it("sets fields to undefined when SDK result provides string values for metrics", async () => {
    const stringValuesQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-strings",
        num_turns: "7",
        duration_ms: "1000",
        duration_api_ms: "800",
        total_cost_usd: "0.05",
        modelUsage: {},
        is_error: false,
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-strings",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: stringValuesQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    // TC-018: string values for number fields must be treated as undefined
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBeUndefined();
    expect(result.invocationMetrics!.durationMs).toBeUndefined();
    expect(result.invocationMetrics!.durationApiMs).toBeUndefined();
    expect(result.invocationMetrics!.totalCostUsd).toBeUndefined();
  });

  it("sets fields to undefined when SDK result provides object values for metrics", async () => {
    const objValuesQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-objs",
        num_turns: {},
        duration_ms: {},
        duration_api_ms: {},
        total_cost_usd: {},
        modelUsage: {},
        is_error: false,
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-objs",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: objValuesQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    // TC-018: object values for number fields must be treated as undefined
    expect(result.invocationMetrics).toBeDefined();
    expect(result.invocationMetrics!.numTurns).toBeUndefined();
    expect(result.invocationMetrics!.durationMs).toBeUndefined();
    expect(result.invocationMetrics!.durationApiMs).toBeUndefined();
    expect(result.invocationMetrics!.totalCostUsd).toBeUndefined();
  });
});
