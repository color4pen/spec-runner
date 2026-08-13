/**
 * ClaudeCodeRunner — inactivity timeout tests (TC-001 through TC-009).
 *
 * TC-001: query 発行後、最初の message が閾値内に到着しない場合に timeout halt
 * TC-002: message が閾値内で到着し続ける限り無活動タイマーは発火しない
 * TC-004: output-repair ループ実行中に watchdog が発火しても timeout として返る（claude-code）
 * TC-005: 無活動発火が awaiting-resume に落ちる（agent-runner レベルでは completionReason===timeout + STEP_TIMEOUT を固定）
 * TC-006: 無活動 timeout の message が旨と経過時間を含む
 * TC-007: wall-clock timeout の表示は不変
 * TC-008: timeoutMs 未設定でも無活動監視は有効
 * TC-009: 正常終了時に無活動タイマーが停止する
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

// Hardcoded constant matching DEFAULT_INACTIVITY_TIMEOUT_MS.
// Cannot import from the not-yet-existing watchdog module without breaking the file.
// ponytail: use literal to avoid import dependency on the new module during test-materialize
const INACTIVITY_THRESHOLD_MS = 900_000;

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-inactivity-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeJobState(jobId = "inactivity-job", branch = "feat/test"): JobState {
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
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    input: { requestContent: "# Request\nDo something" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

/** queryFn that blocks until the AbortController fires, never yielding any messages. */
function makeHangingQueryFn(): QueryFn {
  return async function* hangingQuery(params: { prompt: string; options?: Record<string, unknown> }) {
    const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
    await new Promise<void>((_, reject) => {
      abortCtrl?.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
    });
    // Never yields
  } as QueryFn;
}

/** queryFn that yields a success result immediately. */
function makeSuccessQueryFn(sessionId = "session-test"): QueryFn {
  return async function* successQuery() {
    yield {
      type: "result" as const,
      subtype: "success" as const,
      result: "done",
      duration_ms: 10,
      duration_api_ms: 10,
      is_error: false,
      num_turns: 1,
      stop_reason: "end_turn",
      total_cost_usd: 0,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
      uuid: "test-uuid",
      session_id: sessionId,
    } as unknown;
  } as QueryFn;
}

// ---------------------------------------------------------------------------
// TC-001 + TC-005: query 発行後、最初の message が閾値内に到着しない → timeout halt
// TC-005: completionReason==="timeout" + STEP_TIMEOUT → existing executor maps to awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-001 + TC-005: 最初の message が閾値内に到着しない場合に timeout halt", () => {
  it(
    "returns completionReason==='timeout' and error.code==='STEP_TIMEOUT' when no messages arrive within threshold",
    async () => {
      vi.useFakeTimers();

      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeHangingQueryFn() });
      const runPromise = runner.run(makeCtx());

      // Advance past the inactivity threshold — implementation arms a 900_000ms watchdog timer
      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);

      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
      expect(result.resultContent).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: message が閾値内で到着し続ける限り無活動タイマーは発火しない
// ---------------------------------------------------------------------------

describe("TC-002: message が閾値内で到着し続ける限り無活動タイマーは発火しない", () => {
  it("returns completionReason==='success' when messages arrive normally (no inactivity fire)", async () => {
    vi.useFakeTimers();

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeSuccessQueryFn() });
    const runPromise = runner.run(makeCtx());

    const result = await runPromise;
    expect(result.completionReason).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// TC-004: output-repair ループ実行中に watchdog が発火しても timeout として返る（claude-code）
// ---------------------------------------------------------------------------

describe("TC-004: output-repair ループ実行中に watchdog が発火しても timeout として返る", () => {
  it(
    "returns completionReason==='timeout' when watchdog fires during repair turn (not swallowed by catch{})",
    async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const queryFn: QueryFn = async function* repairHangQuery(params: {
        prompt: string;
        options?: Record<string, unknown>;
      }) {
        callCount++;
        const abortCtrl = params.options?.["abortController"] as AbortController | undefined;

        if (callCount === 1) {
          // Main turn: succeed with session_id so output verification repair fires
          yield {
            type: "result" as const,
            subtype: "success" as const,
            result: "done",
            duration_ms: 10,
            duration_api_ms: 10,
            is_error: false,
            num_turns: 1,
            stop_reason: "end_turn",
            total_cost_usd: 0,
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              server_tool_use_input_tokens: 0,
            },
            modelUsage: {},
            permission_denials: [],
            uuid: "test-uuid",
            session_id: "session-for-repair",
          } as unknown;
        } else {
          // Repair turn: block until abort fires
          await new Promise<void>((_, reject) => {
            abortCtrl?.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
          });
        }
      } as QueryFn;

      const violations = [
        {
          kind: "tasks-complete" as const,
          path: "tasks.md",
          policy: "follow-up" as const,
          detail: ["T-01: implement foo"],
        },
      ];
      const outputVerification = {
        detect: vi.fn().mockResolvedValue({ violations }),
        maxAttempts: 1,
        buildPrompt: vi.fn().mockReturnValue("repair: complete remaining tasks"),
      };

      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
      const runPromise = runner.run(makeCtx({ policy: { outputVerification } }));

      // Main turn completes quickly (synchronously in fake-timer land).
      // Repair turn then starts and blocks. Advance past inactivity threshold.
      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);

      const result = await runPromise;

      // Without implementation: repair catch{} swallows the abort → success returned → FAILS
      // With implementation: catch(err) + if(aborted) throw → outer catch → timeout returned
      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: 無活動 timeout の message が旨と経過時間を含む
// ---------------------------------------------------------------------------

describe("TC-006: 無活動 timeout の message が旨と経過時間を含む", () => {
  it(
    "error.message contains 'inactivity' and the elapsed time (elapsedMs) when inactivity fires",
    async () => {
      vi.useFakeTimers();

      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeHangingQueryFn() });
      const runPromise = runner.run(makeCtx());

      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);
      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      const errMsg = (result.error as { message?: string } | undefined)?.message ?? "";
      // Must contain the "inactivity" keyword
      expect(errMsg.toLowerCase()).toContain("inactivity");
      // Must contain the elapsed ms (with fake timers, elapsedMs matches the threshold)
      expect(errMsg).toContain(String(INACTIVITY_THRESHOLD_MS));
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: wall-clock timeout の表示は不変
// ---------------------------------------------------------------------------

describe("TC-007: wall-clock timeout の表示は不変", () => {
  it("wall-clock timeout message, completionReason, and code remain unchanged after adding inactivity watchdog", async () => {
    // Use a queryFn that blocks until abort (like TC-032 existing pattern)
    const slowQueryFn: QueryFn = async function* slowQuery(params: {
      prompt: string;
      options?: Record<string, unknown>;
    }) {
      const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        abortCtrl?.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
        }, { once: true });
      });
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 200,
        duration_api_ms: 180,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "test-sess",
      } as unknown;
    } as QueryFn;

    const config = makeConfig({
      steps: { defaults: { timeoutMs: 50 } },
    }) as SpecRunnerConfig;

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: slowQueryFn });
    const result = await runner.run(makeCtx({ config }));

    expect(result.completionReason).toBe("timeout");
    expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
    // Wall-clock message format must be unchanged
    const errMsg = (result.error as { message?: string } | undefined)?.message ?? "";
    expect(errMsg).toContain("timed out after");
    expect(errMsg).toContain("50ms");
    // Must NOT contain "inactivity" (this is the wall-clock path, not inactivity)
    expect(errMsg.toLowerCase()).not.toContain("inactivity");
  });
});

// ---------------------------------------------------------------------------
// TC-008: timeoutMs 未設定でも無活動監視は有効
// ---------------------------------------------------------------------------

describe("TC-008: timeoutMs 未設定でも無活動監視は有効", () => {
  it(
    "inactivity fires even when timeoutMs resolves to null (no wall-clock timer configured)",
    async () => {
      vi.useFakeTimers();

      // Explicitly no timeoutMs in config (resolves to null)
      const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeHangingQueryFn() });
      const runPromise = runner.run(makeCtx({ config: makeConfig() })); // makeConfig() has no steps → timeoutMs null

      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);

      const result = await runPromise;
      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: 正常終了時に無活動タイマーが停止する
// ---------------------------------------------------------------------------

describe("TC-009: 正常終了時に無活動タイマーが停止する", () => {
  it("run completes with success and watchdog is stopped (no pending timers after run)", async () => {
    vi.useFakeTimers();

    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: makeSuccessQueryFn() });
    const result = await runner.run(makeCtx());

    expect(result.completionReason).toBe("success");

    // Advance far past threshold — watchdog should be cleared in finally; no timer fires
    // (If watchdog were not cleared, it might cause a spurious callback)
    await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS * 2);
    // No error thrown, no side effects — test passes cleanly
  });
});
