/**
 * Unit tests for ClaudeCodeRunner — context metrics wiring (T-04).
 *
 * TC-028: success / error / timeout の全 return 経路で contextMetrics が設定される
 * TC-029: postWork ターンと output-repair ターンでも observe が呼ばれる
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-runner-ctx-metrics-test-"));
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

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    // Disable transient retries in tests to prevent retry delays from causing timeouts.
    // Tests that specifically test retry behavior should override this via `overrides`.
    transientRetry: { maxRetries: 0 },
    ...overrides,
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
// Helper: build a success result message for the query generator
// ---------------------------------------------------------------------------
function makeSuccessResult(sessionId = "sess-ctx-1", modelName = "claude-sonnet-4-5") {
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
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use_input_tokens: 0,
    },
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

// Helper: build an assistant message with usage data.
// SDKAssistantMessage wraps BetaMessage in a `message` field; usage lives at message.message.usage.
function makeAssistantMessage(usage: {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}) {
  return {
    type: "assistant" as const,
    message: {
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    },
    // No parent_tool_use_id (main agent), not a replay
  } as unknown;
}

// Helper: build a compact_boundary system message
function makeCompactBoundaryMessage(preTokens: number, postTokens?: number) {
  return {
    type: "system" as const,
    subtype: "compact_boundary" as const,
    compact_metadata:
      postTokens !== undefined
        ? { pre_tokens: preTokens, post_tokens: postTokens }
        : { pre_tokens: preTokens },
  } as unknown;
}

// ---------------------------------------------------------------------------
// TC-028: success / error / timeout の全 return 経路で contextMetrics が設定される
// ---------------------------------------------------------------------------

describe("TC-028: success 経路で contextMetrics が AgentRunResult に設定される", () => {
  it("contextMetrics contains peakActiveContextTokens, contextWindowTokens, and compaction from observed messages", async () => {
    const successQueryFn: QueryFn = async function* () {
      // Assistant message: active context = 80000 + 5000 + 2000 = 87000
      yield makeAssistantMessage({
        input_tokens: 80000,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 2000,
      });
      // Compaction event: before=150000, after=40000
      yield makeCompactBoundaryMessage(150000, 40000);
      // Success result with contextWindow in modelUsage
      yield makeSuccessResult();
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: successQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");

    // contextMetrics must be present and populated
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.provider).toBe("claude-code");
    expect(result.contextMetrics!.model).toBe("claude-sonnet-4-5");

    // Peak active context = input + cacheRead + cacheCreate = 80000 + 5000 + 2000 = 87000
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(87000);

    // contextWindow from modelUsage result
    expect(result.contextMetrics!.contextWindowTokens).toBe(200000);

    // Compaction: 1 event with before=150000, after=40000
    expect(result.contextMetrics!.compactionCount).toBe(1);
    expect(result.contextMetrics!.contextTokensBeforeCompaction).toBe(150000);
    expect(result.contextMetrics!.contextTokensAfterCompaction).toBe(40000);

    // No exhaustion in a normal success
    expect(result.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });

  it("contextMetrics peak takes maximum across multiple assistant messages", async () => {
    const multiTurnQueryFn: QueryFn = async function* () {
      // First assistant: active = 50000
      yield makeAssistantMessage({ input_tokens: 50000 });
      // Second assistant: active = 120000 (higher → becomes peak)
      yield makeAssistantMessage({ input_tokens: 120000 });
      // Third assistant: active = 80000 (lower than peak — peak stays at 120000)
      yield makeAssistantMessage({ input_tokens: 80000 });
      yield makeSuccessResult();
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: multiTurnQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(120000);
  });
});

describe("TC-028: error 経路（context exhaustion）で exhaustionAtTokens が設定される", () => {
  it("exhaustionAtTokens is set to last active context when error contains 'Prompt is too long'", async () => {
    const exhaustionQueryFn: QueryFn = async function* () {
      // Observe some active context before exhaustion
      yield makeAssistantMessage({ input_tokens: 180000 });
      // Non-success result with exhaustion error
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        errors: ["Prompt is too long for this model's context window"],
        modelUsage: {},
        usage: {
          input_tokens: 180000,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use_input_tokens: 0,
        },
        permission_denials: [],
        uuid: "test-uuid-exhaust",
        session_id: "sess-exhaust",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: exhaustionQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("error");

    // contextMetrics must be present
    expect(result.contextMetrics).toBeDefined();
    // exhaustionAtTokens = last observed active context (180000 from the assistant message)
    expect(result.contextMetrics!.exhaustionAtTokens).toBe(180000);
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(180000);
  });

  it("exhaustionAtTokens is set when error contains 'context window exceeded'", async () => {
    const exhaustionQueryFn: QueryFn = async function* () {
      yield makeAssistantMessage({ input_tokens: 195000, cache_read_input_tokens: 3000 });
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        errors: ["context window exceeded"],
        modelUsage: {},
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-cwe",
        session_id: "sess-cwe",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: exhaustionQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("error");
    expect(result.contextMetrics).toBeDefined();
    // 195000 + 3000 = 198000
    expect(result.contextMetrics!.exhaustionAtTokens).toBe(198000);
  });
});

describe("TC-028: error 経路（非 context 溢れ）では exhaustionAtTokens が設定されない", () => {
  it("exhaustionAtTokens is undefined when error is not a known context exhaustion pattern", async () => {
    const nonExhaustionErrorQueryFn: QueryFn = async function* () {
      yield makeAssistantMessage({ input_tokens: 100000 });
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        is_error: true,
        stop_reason: null,
        errors: ["internal server error occurred"],
        modelUsage: {},
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-ise",
        session_id: "sess-ise",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: nonExhaustionErrorQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("error");
    expect(result.contextMetrics).toBeDefined();
    // peakActiveContextTokens observed but no exhaustion
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(100000);
    expect(result.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });
});

describe("TC-028: 観測可能な message がない invocation では contextMetrics が undefined", () => {
  it("contextMetrics is undefined when no assistant messages are observed", async () => {
    // Only a success result — no assistant messages with usage
    const noObservationsQueryFn: QueryFn = async function* () {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        session_id: "sess-no-obs",
        is_error: false,
        stop_reason: "end_turn",
        num_turns: 1,
        duration_ms: 100,
        duration_api_ms: 80,
        total_cost_usd: 0.001,
        // No contextWindow in modelUsage
        modelUsage: {
          "claude-sonnet-4-5": {
            inputTokens: 100,
            outputTokens: 10,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            // No contextWindow field
          },
        },
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        permission_denials: [],
        uuid: "test-uuid-no-obs",
      } as unknown;
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: noObservationsQueryFn });
    const result = await runner.run(makeCtx(tempDir));

    expect(result.completionReason).toBe("success");
    // No observable data → contextMetrics must be undefined
    expect(result.contextMetrics).toBeUndefined();
  });
});

describe("TC-028: timeout 経路でも contextMetrics が返る", () => {
  it("contextMetrics is present (with observed data) when invocation times out", async () => {
    // queryFn: emit an assistant message, then hang until abort fires
    const slowQueryFn: QueryFn = async function* (params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      // Emit one observable message before hanging
      yield makeAssistantMessage({ input_tokens: 75000 });

      // Now hang until abort fires
      const abortCtrl = (params.options as Record<string, unknown>)?.["abortController"] as AbortController | undefined;
      await new Promise<void>((_resolve, reject) => {
        if (abortCtrl?.signal.aborted) {
          const err = new Error("AbortError");
          (err as { name: string }).name = "AbortError";
          reject(err);
          return;
        }
        if (abortCtrl) {
          abortCtrl.signal.addEventListener(
            "abort",
            () => {
              const err = new Error("AbortError");
              (err as { name: string }).name = "AbortError";
              reject(err);
            },
            { once: true },
          );
        }
      });
    } as unknown as QueryFn;

    const config: SpecRunnerConfig = {
      ...makeConfig(),
      steps: { defaults: { timeoutMs: 50 } },
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: slowQueryFn });
    const result = await runner.run(makeCtx(tempDir, { config }));

    expect(result.completionReason).toBe("timeout");

    // contextMetrics must be present with the data observed before the timeout
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(75000);
    // No exhaustion (timeout is not a context exhaustion)
    expect(result.contextMetrics!.exhaustionAtTokens).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-029: postWork ターンでも observe が呼ばれ compaction が計上される
// ---------------------------------------------------------------------------

describe("TC-029: postWork ターンの compaction も contextMetrics.compactionCount に含まれる", () => {
  it("compactionCount reflects compaction events from both main work and postWork turns", async () => {
    let callCount = 0;

    const twoTurnQueryFn: QueryFn = async function* () {
      callCount++;

      if (callCount === 1) {
        // Main work turn: 1 compaction, then success
        yield makeAssistantMessage({ input_tokens: 50000 });
        yield makeCompactBoundaryMessage(80000, 20000);
        yield makeSuccessResult("sess-post-1");
      } else {
        // postWork turn: another compaction
        yield makeAssistantMessage({ input_tokens: 25000 });
        yield makeCompactBoundaryMessage(40000, 10000);
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          session_id: "sess-post-1",
          is_error: false,
          stop_reason: "end_turn",
          num_turns: 1,
          duration_ms: 500,
          duration_api_ms: 400,
          total_cost_usd: 0.001,
          modelUsage: {},
          usage: { input_tokens: 25000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          permission_denials: [],
          uuid: "test-uuid-post",
        } as unknown;
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: twoTurnQueryFn });
    const result = await runner.run(
      makeCtx(tempDir, {
        policy: { postWorkPrompts: ["verify your work"] },
      }),
    );

    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);

    // Both compactions (main + postWork) should be counted
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.compactionCount).toBe(2);

    // Peak should be the max across all turns: main=50000, postWork=25000 → 50000
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(50000);

    // Last compaction's before/after: postWork compaction (40000/10000) — last wins
    expect(result.contextMetrics!.contextTokensBeforeCompaction).toBe(40000);
    expect(result.contextMetrics!.contextTokensAfterCompaction).toBe(10000);
  });

  it("single assistant message in main turn is not double-counted when postWork has no compaction", async () => {
    let callCount = 0;

    const queryFnNoDblCount: QueryFn = async function* () {
      callCount++;

      if (callCount === 1) {
        // Main work: one assistant message, one compaction
        yield makeAssistantMessage({ input_tokens: 60000 });
        yield makeCompactBoundaryMessage(90000, 30000);
        yield makeSuccessResult("sess-no-dbl");
      } else {
        // postWork: assistant message but NO compaction
        yield makeAssistantMessage({ input_tokens: 35000 });
        yield {
          type: "result" as const,
          subtype: "success" as const,
          result: "done",
          session_id: "sess-no-dbl",
          is_error: false,
          stop_reason: "end_turn",
          num_turns: 1,
          duration_ms: 200,
          duration_api_ms: 180,
          total_cost_usd: 0.001,
          modelUsage: {},
          usage: { input_tokens: 35000, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
          permission_denials: [],
          uuid: "test-uuid-no-dbl-post",
        } as unknown;
      }
    } as unknown as QueryFn;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFnNoDblCount });
    const result = await runner.run(
      makeCtx(tempDir, {
        policy: { postWorkPrompts: ["check your work"] },
      }),
    );

    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);

    // Only 1 compaction (from main turn)
    expect(result.contextMetrics).toBeDefined();
    expect(result.contextMetrics!.compactionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-044: output-repair ターンの context 溢れで exhaustionAtTokens が設定される
// ---------------------------------------------------------------------------

describe("TC-044: output-repair ターンの context 溢れで exhaustionAtTokens が設定される", () => {
  it("exhaustionAtTokens is set when output-repair turn throws a context exhaustion error", async () => {
    let callCount = 0;

    const repairQueryFn: QueryFn = async function* () {
      callCount++;

      if (callCount === 1) {
        // Main work: observe active context (100000 tokens), then return success with session_id
        yield makeAssistantMessage({ input_tokens: 100000 });
        yield makeSuccessResult("sess-repair-throw-1");
      } else {
        // Output-repair turn: throw context exhaustion error (adapter's catch path marks exhaustion)
        throw new Error("Prompt is too long for this model's context window");
      }
    } as unknown as QueryFn;

    let detectCallCount = 0;
    // Output verification mock: first detect() returns 1 follow-up violation to trigger repair.
    // The repair call then throws with "Prompt is too long", which markExhaustion picks up.
    const outputVerification = {
      maxAttempts: 2,
      detect: async () => {
        detectCallCount++;
        if (detectCallCount === 1) {
          // Return one follow-up violation — triggers the repair turn
          return {
            violations: [
              { kind: "produced" as const, path: "output.md", policy: "follow-up" as const, detail: [] },
            ],
          };
        }
        // After the repair attempt, no more violations
        return { violations: [] as Array<{ kind: "produced"; path: string; policy: "follow-up"; detail: string[] }> };
      },
      buildPrompt: (_violations: unknown, _attempt: number) => "Please produce the required output.",
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: repairQueryFn });
    const result = await runner.run(
      makeCtx(tempDir, {
        policy: { outputVerification },
      }),
    );

    // The main invocation still succeeds (repair failure is best-effort, logged and continued)
    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2); // main work + repair attempt

    expect(result.contextMetrics).toBeDefined();
    // TC-044: exhaustionAtTokens must be set to the last observed active context (100000 from main work)
    expect(result.contextMetrics!.exhaustionAtTokens).toBe(100000);
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(100000);
  });

  it("exhaustionAtTokens is set when output-repair turn returns non-success result with context exhaustion error", async () => {
    let callCount = 0;

    const repairErrorQueryFn: QueryFn = async function* () {
      callCount++;

      if (callCount === 1) {
        // Main work: observe active context, then return success
        yield makeAssistantMessage({ input_tokens: 185000, cache_read_input_tokens: 5000 });
        yield makeSuccessResult("sess-repair-nserr-1");
      } else {
        // Output-repair turn: return a non-success result with context exhaustion error text
        yield {
          type: "result" as const,
          subtype: "error_during_execution" as const,
          is_error: true,
          stop_reason: null,
          errors: ["context window exceeded for this request"],
          modelUsage: {},
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use_input_tokens: 0,
          },
          permission_denials: [],
          uuid: "test-uuid-repair-nserr",
          session_id: "sess-repair-nserr-1",
        } as unknown;
      }
    } as unknown as QueryFn;

    let detectCallCount2 = 0;
    const outputVerification2 = {
      maxAttempts: 2,
      detect: async () => {
        detectCallCount2++;
        if (detectCallCount2 === 1) {
          return {
            violations: [
              { kind: "produced" as const, path: "output.md", policy: "follow-up" as const, detail: [] },
            ],
          };
        }
        return { violations: [] as Array<{ kind: "produced"; path: string; policy: "follow-up"; detail: string[] }> };
      },
      buildPrompt: (_violations: unknown, _attempt: number) => "Repair output.",
    };

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: repairErrorQueryFn });
    const result = await runner.run(
      makeCtx(tempDir, {
        policy: { outputVerification: outputVerification2 },
      }),
    );

    expect(result.completionReason).toBe("success");
    expect(callCount).toBe(2);

    expect(result.contextMetrics).toBeDefined();
    // TC-044: exhaustionAtTokens = last observed active context = 185000 + 5000 = 190000
    expect(result.contextMetrics!.exhaustionAtTokens).toBe(190000);
    expect(result.contextMetrics!.peakActiveContextTokens).toBe(190000);
  });
});
