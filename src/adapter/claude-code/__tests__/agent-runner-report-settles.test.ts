/**
 * Tests: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする
 *
 * TC-001: ok:true 受領後 grace 経過で success settle
 * TC-002: ok:false 受領後 grace 経過で success settle
 * TC-003: grace 内自然終了 → 最終 result から modelUsage 回収
 * TC-004: grace 後 abort 経路で postWork prompts が resume で走る
 * TC-005: report 受領後に hard abort が発火しても report を保全する (D5 catch path)
 * TC-006: report 不在で watchdog 発火 → STEP_TIMEOUT halt
 * TC-007: report 不在で generator 終了 → report retry 経路不変
 * TC-008: resume-fallback 後に grace-exit した場合、postWork が第 2 session の id で resume される
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner, REPORT_SETTLE_GRACE_MS } from "../agent-runner.js";
import type { QueryFn, CreateMcpServerFn } from "../agent-runner.js";
import { DEFAULT_INACTIVITY_TIMEOUT_MS } from "../../shared/inactivity-watchdog.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import type { BaseReportResult, ReportToolSpec } from "../../../core/port/report-result.js";
import { boolean } from "zod/v4-mini";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-report-settles-test-"));
  // Mock readFile so buildArtifactBundle resolves via microtask (not libuv I/O),
  // making vi.advanceTimersByTimeAsync deterministic in slow CI environments.
  vi.spyOn(fs, "readFile").mockRejectedValue(
    Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
  );
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 2,
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

function makeConfig(overrides?: Partial<SpecRunnerConfig["steps"]>): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {}, steps: overrides };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(step: AgentStep, state: JobState, overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step,
    state,
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Report tool mock
// ---------------------------------------------------------------------------

/**
 * Minimal ReportToolSpec that accepts { ok: boolean }.
 */
const mockReportTool: ReportToolSpec<BaseReportResult> = {
  name: "report_result",
  description: "Report completion",
  zodSchema: { ok: boolean() },
  parseInput: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, missingFields: ["ok"], rawInput: raw };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj["ok"] !== "boolean") {
      return { ok: false, missingFields: ["ok"], rawInput: raw };
    }
    return { ok: true, value: { ok: obj["ok"] as boolean } };
  },
};

// ---------------------------------------------------------------------------
// MCP server capture helper
// ---------------------------------------------------------------------------

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;

/**
 * Creates a fake _createMcpServerFn that captures the report_result handler.
 * The captured handler can then be called directly from queryFn to simulate
 * report_result being invoked without going through the real SDK.
 */
function makeMcpCapture(): { createMcpServerFn: CreateMcpServerFn; getHandler: () => ToolHandler | null } {
  let capturedHandler: ToolHandler | null = null;

  const createMcpServerFn: CreateMcpServerFn = (params) => {
    const tools = params["tools"] as Array<{ handler: ToolHandler }> | undefined;
    if (tools?.[0]) {
      capturedHandler = tools[0].handler;
    }
    return null; // return value unused when queryFn is injected
  };

  return { createMcpServerFn, getHandler: () => capturedHandler };
}

// ---------------------------------------------------------------------------
// TC-001: ok:true 受領後 grace 経過で success settle
// ---------------------------------------------------------------------------

describe("TC-001: ok:true 受領後 grace 経過で success settle", () => {
  it("completionReason=success, toolResult.ok=true after grace fires", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();

    const queryFn: QueryFn = async function* (params) {
      const opts = params.options as { abortController?: AbortController } | undefined;
      const signal = opts?.["abortController"]?.signal;
      // Yield init message with session_id (T-02 early capture)
      yield { type: "system", session_id: "session-tc001" };
      // Simulate report_result tool call: this sets capturedToolResult and arms grace
      await getHandler()!({ ok: true });
      // Hang until mainQueryAbort fires (grace will abort it after REPORT_SETTLE_GRACE_MS)
      await new Promise<void>((_, reject) => {
        if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
        signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
      });
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-001"), {
      policy: { reportTool: mockReportTool },
    });
    const resultPromise = runner.run(ctx);

    // Let setup complete (buildArtifactBundle, runQuery start, generator reach hang)
    await vi.advanceTimersByTimeAsync(100);
    // Fire the grace timer (60s) → mainQueryAbort.abort() → for-await exits normally
    await vi.advanceTimersByTimeAsync(REPORT_SETTLE_GRACE_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("success");
    expect(result.toolResult).not.toBeNull();
    expect(result.toolResult?.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: ok:false 受領後 grace 経過で success settle
// ---------------------------------------------------------------------------

describe("TC-002: ok:false 受領後 grace 経過で success settle", () => {
  it("completionReason=success, toolResult.ok=false — executor receives it unchanged", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();

    const queryFn: QueryFn = async function* (params) {
      const opts = params.options as { abortController?: AbortController } | undefined;
      const signal = opts?.["abortController"]?.signal;
      yield { type: "system", session_id: "session-tc002" };
      // Report with ok:false — adapter settles success regardless; executor interprets ok
      await getHandler()!({ ok: false });
      await new Promise<void>((_, reject) => {
        if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
        signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
      });
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-002"), {
      policy: { reportTool: mockReportTool },
    });
    const resultPromise = runner.run(ctx);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(REPORT_SETTLE_GRACE_MS);
    const result = await resultPromise;

    // Adapter returns success; toolResult carries ok:false for executor to interpret
    expect(result.completionReason).toBe("success");
    expect(result.toolResult).not.toBeNull();
    expect(result.toolResult?.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003: grace 内自然終了 → 最終 result から modelUsage 回収
// ---------------------------------------------------------------------------

describe("TC-003: grace 内自然終了 → 最終 result から modelUsage 回収", () => {
  it("grace timer never fires; modelUsage comes from the final result", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();

    const expectedUsage = {
      "claude-sonnet-4-6": {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    };

    const queryFn: QueryFn = async function* () {
      yield { type: "system", session_id: "session-tc003" };
      await getHandler()!({ ok: true });
      // Yield final success result with modelUsage — generator ends naturally (no hang)
      yield {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: "session-tc003",
        modelUsage: expectedUsage,
      };
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-003"), {
      policy: { reportTool: mockReportTool },
    });
    const resultPromise = runner.run(ctx);

    // No need to advance timers for grace — generator completes naturally.
    // Advance a tiny bit to flush microtasks (buildArtifactBundle mock resolves).
    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;

    expect(result.completionReason).toBe("success");
    expect(result.toolResult?.ok).toBe(true);
    // modelUsage must come from the final success result (grace timer never fired)
    expect(result.modelUsage).toBeDefined();
    expect(result.modelUsage?.["claude-sonnet-4-6"]).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
    });
  });
});

// ---------------------------------------------------------------------------
// TC-004: grace 後 abort 経路で postWork prompts が resume で走る
// ---------------------------------------------------------------------------

describe("TC-004: grace 後 abort 経路で postWork prompts が resume で走る", () => {
  it("postWork turn uses the session_id from early-captured init message as resume", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();
    let callCount = 0;
    let capturedResume: string | undefined;

    const queryFn: QueryFn = async function* (params) {
      callCount++;
      const opts = params.options as { abortController?: AbortController; resume?: string } | undefined;
      const signal = opts?.["abortController"]?.signal;

      if (callCount === 1) {
        // Main work turn: yield init message, call report handler, then hang
        yield { type: "system", session_id: "session-tc004-early" };
        await getHandler()!({ ok: true });
        // Hang until grace fires and aborts mainQueryAbort
        await new Promise<void>((_, reject) => {
          if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
          signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
        });
      } else {
        // postWork turn: capture the resume option and return success
        capturedResume = opts?.["resume"];
        yield {
          type: "result",
          subtype: "success",
          result: "postwork done",
          session_id: "session-tc004-early",
        };
      }
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-004"), {
      policy: {
        reportTool: mockReportTool,
        postWorkPrompts: ["please wrap up"],
      },
    });
    const resultPromise = runner.run(ctx);

    // Let setup complete and generator reach hang
    await vi.advanceTimersByTimeAsync(100);
    // Fire grace timer → main work turn exits normally → postWork runs
    await vi.advanceTimersByTimeAsync(REPORT_SETTLE_GRACE_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("success");
    // postWork must have been called (callCount >= 2)
    expect(callCount).toBeGreaterThanOrEqual(2);
    // resume must match the session_id from the early-captured init message
    expect(capturedResume).toBe("session-tc004-early");
  });
});

// ---------------------------------------------------------------------------
// TC-005: report 受領後に hard abort が発火しても report を保全する (D5 catch path)
// ---------------------------------------------------------------------------

describe("TC-005: D5 catch path — hard abort after report received → success settle", () => {
  it("step-timeout fires before grace; D5 returns success with captured toolResult", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();

    // Step timeout = 5s < REPORT_SETTLE_GRACE_MS (60s) → step-timeout fires first
    const STEP_TIMEOUT_MS = 5_000;

    const queryFn: QueryFn = async function* (params) {
      const opts = params.options as { abortController?: AbortController } | undefined;
      const signal = opts?.["abortController"]?.signal;
      yield { type: "system", session_id: "session-tc005" };
      await getHandler()!({ ok: true }); // sets capturedToolResult, arms 60s grace
      // Hang until mainQueryAbort fires (will come from shared abort via propagation)
      await new Promise<void>((_, reject) => {
        if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
        signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
      });
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-005"), {
      policy: { reportTool: mockReportTool },
      // Use a config where step timeout < grace so step-timeout fires first
      config: makeConfig({ implementer: { timeoutMs: STEP_TIMEOUT_MS } }),
    });
    const resultPromise = runner.run(ctx);

    await vi.advanceTimersByTimeAsync(100);
    // Advance by step timeout (5s) — fires shared abort BEFORE grace (60s)
    // shared abort → propagation → mainQueryAbort.abort() → inner catch re-throws
    // (settledByReport=false because grace hasn't fired) → outer catch → D5 branch
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);
    const result = await resultPromise;

    // D5: report preserved, success returned instead of STEP_TIMEOUT
    expect(result.completionReason).toBe("success");
    expect(result.toolResult).not.toBeNull();
    expect(result.toolResult?.ok).toBe(true);
    // No STEP_TIMEOUT error
    expect((result.error as { code?: string } | undefined)?.code).not.toBe("STEP_TIMEOUT");
  });
});

// ---------------------------------------------------------------------------
// TC-006: report 不在で watchdog 発火 → STEP_TIMEOUT halt
// ---------------------------------------------------------------------------

describe("TC-006: report 不在で watchdog 発火 → 従来どおり STEP_TIMEOUT halt", () => {
  it("completionReason=timeout, error.code=STEP_TIMEOUT when no report and watchdog fires", async () => {
    vi.useFakeTimers();

    // No handler call — capturedToolResult stays null → D5 does not apply → existing timeout path
    const queryFn: QueryFn = async function* (params) {
      const opts = params.options as { abortController?: AbortController } | undefined;
      const signal = opts?.["abortController"]?.signal;
      yield { type: "system", session_id: "session-tc006" };
      // Hang without calling handler — report never received
      await new Promise<void>((_, reject) => {
        if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
        signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
      });
    };

    // reportTool is configured but agent never calls it
    const { createMcpServerFn } = makeMcpCapture();
    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-006"), {
      policy: { reportTool: mockReportTool },
    });
    const resultPromise = runner.run(ctx);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    // Fallback unchanged: STEP_TIMEOUT, toolResult=null
    expect(result.completionReason).toBe("timeout");
    expect(result.toolResult).toBeNull();
    const error = result.error as Error & { code?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
  });
});

// ---------------------------------------------------------------------------
// TC-008: resume-fallback 後に grace-exit した場合、postWork が第 2 session の id で resume される
// ---------------------------------------------------------------------------

describe("TC-008: resume-fallback → grace-exit → postWork uses second session id", () => {
  it("postWork resumes with fallback session id, not the stale resumeSessionId", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn, getHandler } = makeMcpCapture();
    let callCount = 0;
    let capturedResume: string | undefined;

    const queryFn: QueryFn = async function* (params) {
      callCount++;
      const opts = params.options as { abortController?: AbortController; resume?: string } | undefined;
      const signal = opts?.["abortController"]?.signal;

      if (callCount === 1) {
        // First call: throw to trigger resume-fallback (non-transient, non-abort error)
        throw new Error("session not found: old-session-id");
      } else if (callCount === 2) {
        // Second call (fresh session after fallback): provide new session_id, call handler, then hang
        yield { type: "system", session_id: "new-session-id" };
        await getHandler()!({ ok: true });
        await new Promise<void>((_, reject) => {
          if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
          signal?.addEventListener("abort", () => reject(signal?.reason ?? new Error("aborted")));
        });
      } else {
        // postWork turn: capture resume option and return success
        capturedResume = opts?.["resume"];
        yield {
          type: "result",
          subtype: "success",
          result: "postwork done",
          session_id: "new-session-id",
        };
      }
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-008"), {
      session: { resumeSessionId: "old-session-id" },
      policy: {
        reportTool: mockReportTool,
        postWorkPrompts: ["please wrap up"],
      },
    });
    const resultPromise = runner.run(ctx);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(REPORT_SETTLE_GRACE_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("success");
    // postWork must have been called (callCount >= 3: throw + fallback + postWork)
    expect(callCount).toBeGreaterThanOrEqual(3);
    // postWork must resume with the second session's id, not the stale one
    expect(capturedResume).toBe("new-session-id");
    expect(capturedResume).not.toBe("old-session-id");
  });
});

// ---------------------------------------------------------------------------
// TC-007: report 不在で generator 終了 → report retry 経路不変
// ---------------------------------------------------------------------------

describe("TC-007: report 不在で generator 終了 → report retry 経路不変", () => {
  it("queryFn is called multiple times (report retry); toolResult=null; no grace timer", async () => {
    vi.useFakeTimers();

    const { createMcpServerFn } = makeMcpCapture();
    let callCount = 0;

    // Minimal follow-up policy: 1 retry attempt for faster test
    const retryPolicy = {
      maxAttempts: 1,
      buildPrompt: () => "please call report_result",
    };

    const queryFn: QueryFn = async function* (_params) {
      callCount++;
      // Every call: just yield a success result without calling the handler
      yield {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: "session-tc007",
      };
    };

    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
    });
    const ctx = makeCtx(makeAgentStep(), makeJobState("tc-007"), {
      policy: {
        reportTool: mockReportTool,
        toolReportRetry: retryPolicy,
      },
    });
    const resultPromise = runner.run(ctx);

    // No timer advancement needed — generator completes synchronously via microtasks
    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;

    // Report retry was executed: queryFn called > 1 time (main turn + at least 1 retry)
    expect(callCount).toBeGreaterThan(1);
    // toolResult=null because handler was never called
    expect(result.toolResult).toBeNull();
    // Grace timer was never armed (no capturedToolResult → armReportGrace never called)
    // Grace timer firing would require advancing REPORT_SETTLE_GRACE_MS — we never did
    // completionReason is success at adapter level (toolResult=null → executor decides)
    expect(result.completionReason).toBe("success");
  });
});
