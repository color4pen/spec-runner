/**
 * Unit tests for CodexAgentRunner
 */
import * as os from "node:os";
import * as nodePath from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexInstance, CodexThread, CodexAgentRunnerDeps } from "../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { DynamicContext } from "../../../src/git/dynamic-context.js";
import { REPORT_TOOL } from "../../../src/core/step/report-tool.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeJobState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
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
    // Disable transient retry by default so existing tests are unaffected
    transientRetry: { maxRetries: 0 },
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
    cwd: "/fake/cwd",
    input: { requestContent: "# Request\nDo something" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

/** Build the async generator for a single streamed turn. */
async function* makeEventStream(params: {
  finalResponse: string;
  items?: Array<{ type: string; [key: string]: unknown }>;
  usage?: { input_tokens: number; output_tokens: number; cached_input_tokens?: number } | null;
}) {
  const items = params.items ?? [];
  for (const item of items) {
    yield { type: "item.completed", item };
  }
  yield {
    type: "item.completed",
    item: { type: "agent_message", text: params.finalResponse },
  };
  if (params.usage !== undefined && params.usage !== null) {
    yield { type: "turn.completed", usage: params.usage };
  }
}

/** Return value shape for runStreamed mock. */
function makeStreamedTurn(params: {
  finalResponse: string;
  items?: Array<{ type: string; [key: string]: unknown }>;
  usage?: { input_tokens: number; output_tokens: number; cached_input_tokens?: number } | null;
}) {
  return { events: makeEventStream(params) };
}

function makeThread(turnResult: {
  finalResponse: string;
  items?: unknown[];
  usage?: unknown;
  id?: string;
}): CodexThread {
  return {
    id: turnResult.id ?? "thread-default-id",
    runStreamed: vi.fn().mockResolvedValue(makeStreamedTurn({
      finalResponse: turnResult.finalResponse,
      items: (turnResult.items as Array<{ type: string }> | undefined) ?? [],
      usage: turnResult.usage as { input_tokens: number; output_tokens: number; cached_input_tokens?: number } | null | undefined ?? null,
    })),
  };
}

function makeCodexFactory(thread: CodexThread): () => CodexInstance {
  return vi.fn().mockReturnValue({
    startThread: vi.fn().mockReturnValue(thread),
    resumeThread: vi.fn().mockReturnValue(thread),
  });
}

function makeRunner(deps: CodexAgentRunnerDeps = {}): CodexAgentRunner {
  return new CodexAgentRunner({ _sleepFn: async () => {}, ...deps });
}

// ---------------------------------------------------------------------------
// Main suite
// ---------------------------------------------------------------------------

describe("CodexAgentRunner", () => {
  it("implements AgentRunner interface (has run method)", () => {
    const runner = makeRunner();
    expect(typeof runner.run).toBe("function");
  });

  it("returns success with finalResponse when resultFilePath is null", async () => {
    const thread = makeThread({ finalResponse: "done!" });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx());
    expect(result.completionReason).toBe("success");
    expect(result.resultContent).toBe("done!");
  });

  it("passes workingDirectory as cwd to startThread", async () => {
    const thread = makeThread({ finalResponse: "" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const factory = vi.fn().mockReturnValue({ startThread: mockStartThread });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ cwd: "/my/worktree" });
    await runner.run(ctx);

    expect(mockStartThread).toHaveBeenCalledWith(
      expect.objectContaining({ workingDirectory: "/my/worktree" }),
    );
  });

  it("passes sandboxMode workspace-write to startThread", async () => {
    const thread = makeThread({ finalResponse: "" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const factory = vi.fn().mockReturnValue({ startThread: mockStartThread });
    const runner = makeRunner({ _codexFactory: factory });

    await runner.run(makeCtx());

    expect(mockStartThread).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxMode: "workspace-write",
        skipGitRepoCheck: true,
        model: expect.any(String),
      }),
    );
  });

  it("maps Codex usage to ModelUsage", async () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cached_input_tokens: 30,
    };
    const thread = makeThread({ finalResponse: "ok", usage });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx());
    expect(result.modelUsage).toBeDefined();
    const modelUsage = result.modelUsage!;
    const modelKey = Object.keys(modelUsage)[0]!;
    expect(modelUsage[modelKey]!.inputTokens).toBe(100);
    expect(modelUsage[modelKey]!.outputTokens).toBe(50);
    expect(modelUsage[modelKey]!.cacheReadInputTokens).toBe(30);
    expect(modelUsage[modelKey]!.cacheCreationInputTokens).toBe(0);
  });

  it("returns error when Codex SDK throws", async () => {
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue({
        id: "t1",
        runStreamed: vi.fn().mockRejectedValue(new Error("network failure")),
      }),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx());
    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toContain("network failure");
    expect((result.error as { code?: string })?.code).toBe("CODEX_SDK_ERROR");
  });

  it("includes branch, slug, and projectContext in prompt via additionalInstructions", async () => {
    const thread = makeThread({ finalResponse: "" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    await runner.run(makeCtx({
      branch: "feat/my-feature",
      slug: "my-feature",
      input: { requestContent: "# Request\nDo something", projectContext: "<project context text>" },
    }));

    const promptPassed = (mockRunStreamed.mock.calls[0] as [string])[0];
    expect(promptPassed).toContain("feat/my-feature");
    expect(promptPassed).toContain("my-feature");
    expect(promptPassed).toContain("<project context text>");
  });

  it("returns RESULT_FILE_NOT_FOUND error when result file is missing", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const step = makeAgentStep({
      resultFilePath: () => "/nonexistent/path/result.md",
    });
    const result = await runner.run(makeCtx({ step, cwd: "/fake/cwd" }));
    expect(result.completionReason).toBe("error");
    expect((result.error as { code?: string })?.code).toBe("RESULT_FILE_NOT_FOUND");
  });

  // TC-01: resultFilePath defined and file exists → resultContent equals file content
  it("reads result file content when resultFilePath is defined and file exists", async () => {
    const tmpFile = nodePath.join(os.tmpdir(), `specrunner-test-tc01-${Date.now()}.md`);
    const fileContent = "# Result\nThis is the result content from disk";
    await fs.writeFile(tmpFile, fileContent, "utf-8");
    try {
      const thread = makeThread({ finalResponse: "agent final response" });
      const factory = makeCodexFactory(thread);
      const runner = makeRunner({ _codexFactory: factory });

      const step = makeAgentStep({ resultFilePath: () => tmpFile });
      const result = await runner.run(makeCtx({ step }));

      expect(result.completionReason).toBe("success");
      expect(result.resultContent).toBe(fileContent);
      expect(result.resultContent).not.toBe("agent final response");
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  // TC-03: timeout handling via AbortController
  it("returns timeout when timeoutMs fires before runStreamed resolves", async () => {
    vi.useFakeTimers();
    try {
      const thread: CodexThread = {
        id: "thread-timeout-test",
        runStreamed: vi.fn().mockImplementation((_prompt: string, opts?: { signal?: AbortSignal }) => {
          return new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              reject(new Error("AbortError"));
            });
          });
        }),
      };
      const mockStartThread = vi.fn().mockReturnValue(thread);
      const factory = vi.fn().mockReturnValue({ startThread: mockStartThread, resumeThread: vi.fn() });
      const runner = makeRunner({ _codexFactory: factory });

      const config: SpecRunnerConfig = {
        ...makeConfig(),
        steps: { implementer: { timeoutMs: 100 } },
      };
      const runPromise = runner.run(makeCtx({ config }));

      await vi.advanceTimersByTimeAsync(100);

      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string })?.code).toBe("STEP_TIMEOUT");
      expect(result.resultContent).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // TC-baseBranch-01: requestBaseBranch supplied → StepContext.request.baseBranch propagated
  it("propagates requestBaseBranch to StepContext.request.baseBranch when supplied", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const buildMessage = vi.fn().mockReturnValue("build message result");
    const step = makeAgentStep({ buildMessage });
    const ctx = makeCtx({ step, input: { requestContent: "# Request\nDo something", requestBaseBranch: "develop" } });

    await runner.run(ctx);

    const stepCtxArg = buildMessage.mock.calls[0]?.[1] as { request?: { baseBranch?: string } };
    expect(stepCtxArg?.request?.baseBranch).toBe("develop");
  });

  // TC-baseBranch-02: requestBaseBranch absent → StepContext.request.baseBranch falls back to "main"
  it("falls back to baseBranch \"main\" when requestBaseBranch is absent", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const buildMessage = vi.fn().mockReturnValue("build message result");
    const step = makeAgentStep({ buildMessage });
    const ctx = makeCtx({ step, input: { requestContent: "# Request\nDo something" } });

    await runner.run(ctx);

    const stepCtxArg = buildMessage.mock.calls[0]?.[1] as { request?: { baseBranch?: string } };
    expect(stepCtxArg?.request?.baseBranch).toBe("main");
  });

  // TC-08: enrichContext called before buildMessage, enriched context passed through
  it("calls enrichContext before buildMessage and passes enriched dynamicContext", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const initialDynamicCtx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
    };
    const enrichedDynamicCtx: DynamicContext = {
      gitLog: "enriched-log",
      diffStat: "",
      changesList: [],
    };

    const enrichContext = vi.fn().mockResolvedValue(enrichedDynamicCtx);
    const buildMessage = vi.fn().mockReturnValue("build message result");

    const step = makeAgentStep({ enrichContext, buildMessage });
    const ctx = makeCtx({ step, input: { requestContent: "# Request\nDo something", dynamicContext: initialDynamicCtx } });

    await runner.run(ctx);

    expect(enrichContext).toHaveBeenCalledTimes(1);

    // buildMessage receives StepContext (StepDeps) as second argument
    const stepCtxArg = buildMessage.mock.calls[0]?.[1] as { dynamicContext?: DynamicContext };
    expect(stepCtxArg?.dynamicContext).toEqual(enrichedDynamicCtx);
    expect(stepCtxArg?.dynamicContext).not.toEqual(initialDynamicCtx);
  });
});

// ---------------------------------------------------------------------------
// Session continuity (T-08)
// ---------------------------------------------------------------------------

describe("CodexAgentRunner session continuity (resumeSessionId)", () => {
  it("calls resumeThread when resumeSessionId is set (not startThread)", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-resumed" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const mockResumeThread = vi.fn().mockReturnValue(thread);
    const factory = vi.fn().mockReturnValue({
      startThread: mockStartThread,
      resumeThread: mockResumeThread,
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ session: { resumeSessionId: "thread-existing" } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(mockResumeThread).toHaveBeenCalledWith("thread-existing");
    expect(mockStartThread).not.toHaveBeenCalled();
  });

  it("calls startThread when resumeSessionId is NOT set (not resumeThread)", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-new" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const mockResumeThread = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: mockStartThread,
      resumeThread: mockResumeThread,
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(mockStartThread).toHaveBeenCalled();
    expect(mockResumeThread).not.toHaveBeenCalled();
  });

  it("falls back to startThread when resumeThread throws", async () => {
    const freshThread = makeThread({ finalResponse: "done-fresh", id: "thread-fallback" });
    const warnLines: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      warnLines.push(String(chunk));
      return true;
    });

    const mockStartThread = vi.fn().mockReturnValue(freshThread);
    const mockResumeThread = vi.fn().mockImplementation(() => {
      throw new Error("thread not found in storage");
    });
    const factory = vi.fn().mockReturnValue({
      startThread: mockStartThread,
      resumeThread: mockResumeThread,
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ session: { resumeSessionId: "thread-expired" } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(mockResumeThread).toHaveBeenCalledWith("thread-expired");
    expect(mockStartThread).toHaveBeenCalled();
    expect(warnLines.some((l) => l.includes("warn") || l.includes("resume"))).toBe(true);

    stderrSpy.mockRestore();
  });

  it("result includes sessionId equal to thread.id", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-id-123" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const mockResumeThread = vi.fn().mockReturnValue(thread);
    const factory = vi.fn().mockReturnValue({
      startThread: mockStartThread,
      resumeThread: mockResumeThread,
    });
    const runner = makeRunner({ _codexFactory: factory });

    // Test with resumeSessionId set
    const ctxResume = makeCtx({ session: { resumeSessionId: "thread-id-123" } });
    const resumeResult = await runner.run(ctxResume);
    expect(resumeResult.sessionId).toBe("thread-id-123");

    // Test without resumeSessionId (fresh start)
    const ctxFresh = makeCtx();
    const freshResult = await runner.run(ctxFresh);
    expect(freshResult.sessionId).toBe("thread-id-123");
  });
});

// ---------------------------------------------------------------------------
// CodexAgentRunner follow-up 2-turn execution
// TC-27, TC-28, TC-29, TC-30, TC-31, TC-32 covered here
// TC-58: CodexAgentRunner unit test (T-12) — このファイルが全 case green であること
// ---------------------------------------------------------------------------

describe("CodexAgentRunner follow-up 2-turn execution", () => {
  it("followUpPrompt 指定時に thread.runStreamed が 2 回呼ばれる (同一 thread)", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-001" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ step: makeAgentStep({ followUpPrompt: "fix format violations" }), policy: { postWorkPrompts: ["fix format violations"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(mockRunStreamed).toHaveBeenCalledTimes(2);
  });

  it("2 回目の thread.runStreamed prompt が followUpPrompt", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-002" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ step: makeAgentStep({ followUpPrompt: "read rules and fix" }), policy: { postWorkPrompts: ["read rules and fix"] } });
    await runner.run(ctx);

    expect(mockRunStreamed).toHaveBeenCalledTimes(2);
    // First call with full work prompt
    const firstCallPrompt = (mockRunStreamed.mock.calls[0] as [string])[0];
    expect(firstCallPrompt).not.toBe("read rules and fix");
    // Second call with follow-up prompt
    const secondCallPrompt = (mockRunStreamed.mock.calls[1] as [string])[0];
    expect(secondCallPrompt).toBe("read rules and fix");
  });

  it("followUpPrompt 未指定時に thread.runStreamed が 1 回のみ", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-003" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx(); // no followUpPrompt
    await runner.run(ctx);

    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });

  it("modelUsage が turn 1 + turn 2 の加算 (per-turn 加算)", async () => {
    const turn1Usage = { input_tokens: 100, output_tokens: 50, cached_input_tokens: 10 };
    const turn2Usage = { input_tokens: 80, output_tokens: 40, cached_input_tokens: 5 };

    let callCount = 0;
    const thread: CodexThread = {
      id: "thread-usage",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(makeStreamedTurn({
          finalResponse: "done",
          usage: callCount === 1 ? turn1Usage : turn2Usage,
        }));
      }),
    };

    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ step: makeAgentStep({ followUpPrompt: "fix it" }), policy: { postWorkPrompts: ["fix it"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.modelUsage).toBeDefined();
    const modelKey = Object.keys(result.modelUsage!)[0]!;
    // Should be sum: 100+80=180 input, 50+40=90 output, 10+5=15 cached
    expect(result.modelUsage![modelKey]!.inputTokens).toBe(180);
    expect(result.modelUsage![modelKey]!.outputTokens).toBe(90);
    expect(result.modelUsage![modelKey]!.cacheReadInputTokens).toBe(15);
  });

  it("signal が follow turn にも渡される", async () => {
    const receivedSignals: (AbortSignal | undefined)[] = [];
    let callCount = 0;

    const thread: CodexThread = {
      id: "thread-signal",
      runStreamed: vi.fn().mockImplementation((_prompt: string, opts?: { signal?: AbortSignal }) => {
        callCount++;
        receivedSignals.push(opts?.signal);
        return Promise.resolve(makeStreamedTurn({ finalResponse: "done" }));
      }),
    };

    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ step: makeAgentStep({ followUpPrompt: "follow" }), policy: { postWorkPrompts: ["follow"] } });
    await runner.run(ctx);

    expect(callCount).toBe(2);
    // Both turns should receive the same AbortSignal
    expect(receivedSignals[0]).toBeDefined();
    expect(receivedSignals[1]).toBeDefined();
    expect(receivedSignals[0]).toBe(receivedSignals[1]); // same signal
  });

  it("followUpPrompts 2 件: thread.runStreamed が 3 回呼ばれる", async () => {
    const thread = makeThread({ finalResponse: "done", id: "thread-n-stage" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { postWorkPrompts: ["rule-1", "rule-2"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(mockRunStreamed).toHaveBeenCalledTimes(3);
  });

  it("Thread.id が null の場合 sessionId が undefined になる", async () => {
    const nullIdThread: CodexThread = {
      id: null,
      runStreamed: vi.fn().mockResolvedValue(makeStreamedTurn({ finalResponse: "done" })),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(nullIdThread),
      resumeThread: vi.fn().mockReturnValue(nullIdThread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx();
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.sessionId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// codex-typed-outcome: typed outcome via outputSchema (T-01 through T-07)
// ---------------------------------------------------------------------------

describe("CodexAgentRunner typed outcome (codex-typed-outcome)", () => {
  // T-07 test a: reportTool set → thread.runStreamed() called with outputSchema
  it("reportTool set → thread.runStreamed() called with outputSchema in opts", async () => {
    const validResponse = JSON.stringify({ ok: true });
    const thread = makeThread({ finalResponse: validResponse });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { reportTool: REPORT_TOOL } });
    await runner.run(ctx);

    const firstCallOpts = (mockRunStreamed.mock.calls[0] as [string, { signal?: AbortSignal; outputSchema?: unknown }])[1];
    expect(firstCallOpts).toBeDefined();
    expect(firstCallOpts.outputSchema).toBeDefined();
    expect(typeof firstCallOpts.outputSchema).toBe("object");
  });

  // T-07 test b: finalResponse valid JSON → toolResult populated, followUpAttempts: 0
  it("finalResponse valid JSON → toolResult populated, followUpAttempts: 0", async () => {
    const validResponse = JSON.stringify({ ok: true });
    const thread = makeThread({ finalResponse: validResponse });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { reportTool: REPORT_TOOL } });
    const result = await runner.run(ctx);

    expect(result.toolResult).toEqual({ ok: true });
    expect(result.followUpAttempts).toBe(0);
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });

  // T-07 test c: finalResponse invalid → follow-up retry → retry has valid JSON → toolResult populated
  it("finalResponse invalid → retry with valid JSON → toolResult populated, followUpAttempts: 1", async () => {
    let callCount = 0;
    const thread: CodexThread = {
      id: "thread-retry-success",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Main turn: invalid JSON (no outputSchema result yet)
          return Promise.resolve(makeStreamedTurn({ finalResponse: "not valid json" }));
        }
        // First retry: valid JSON
        return Promise.resolve(makeStreamedTurn({ finalResponse: JSON.stringify({ ok: true }) }));
      }),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { reportTool: REPORT_TOOL } });
    const result = await runner.run(ctx);

    expect(result.toolResult).toEqual({ ok: true });
    expect(result.followUpAttempts).toBe(1);
    expect(callCount).toBe(2); // main + 1 retry
  });

  // TC-013: retry turns also receive outputSchema
  it("retry turn → thread.runStreamed() also called with outputSchema in opts", async () => {
    let callCount = 0;
    const capturedOpts: Array<{ signal?: AbortSignal; outputSchema?: unknown }> = [];
    const thread: CodexThread = {
      id: "thread-retry-schema",
      runStreamed: vi.fn().mockImplementation((_prompt: string, opts?: { signal?: AbortSignal; outputSchema?: unknown }) => {
        callCount++;
        capturedOpts.push(opts ?? {});
        if (callCount === 1) {
          // Main turn: invalid JSON → triggers retry
          return Promise.resolve(makeStreamedTurn({ finalResponse: "not valid json" }));
        }
        // First retry: valid JSON
        return Promise.resolve(makeStreamedTurn({ finalResponse: JSON.stringify({ ok: true }) }));
      }),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { reportTool: REPORT_TOOL } });
    await runner.run(ctx);

    expect(callCount).toBe(2); // main + 1 retry
    // Main turn must have outputSchema
    expect(capturedOpts[0]).toHaveProperty("outputSchema");
    // Retry turn must also have outputSchema
    expect(capturedOpts[1]).toHaveProperty("outputSchema");
  });

  // T-07 test d: all retries exhausted → toolResult: null, followUpAttempts: maxAttempts
  it("all retries exhausted → toolResult: null, followUpAttempts: maxAttempts (2)", async () => {
    const thread = makeThread({ finalResponse: "not json at all" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    // DEFAULT_TOOL_RETRY.maxAttempts = 2
    const ctx = makeCtx({ policy: { reportTool: REPORT_TOOL } });
    const result = await runner.run(ctx);

    expect(result.toolResult).toBeNull();
    expect(result.followUpAttempts).toBe(2);
    // main + 2 retries = 3 calls total
    expect(mockRunStreamed).toHaveBeenCalledTimes(3);
  });

  // T-07 test e: reportTool not set → toolResult: null, no outputSchema (backward compat)
  it("reportTool not set → toolResult: null, followUpAttempts: 0 (backward compat)", async () => {
    const thread = makeThread({ finalResponse: "some text content" });
    const mockRunStreamed = thread.runStreamed as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx(); // no reportTool
    const result = await runner.run(ctx);

    expect(result.toolResult).toBeNull();
    expect(result.followUpAttempts).toBe(0);
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);

    // outputSchema must NOT be present when reportTool is not set
    const firstCallOpts = (mockRunStreamed.mock.calls[0] as [string, { signal?: AbortSignal; outputSchema?: unknown }])[1];
    expect(firstCallOpts).not.toHaveProperty("outputSchema");
  });

  // Extra: postWorkPrompts turns do NOT receive outputSchema (T-06)
  it("postWorkPrompts turns do NOT receive outputSchema", async () => {
    const validResponse = JSON.stringify({ ok: true });
    let callCount = 0;
    const thread: CodexThread = {
      id: "thread-postwork",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(makeStreamedTurn({ finalResponse: validResponse }));
      }),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({
      policy: {
        reportTool: REPORT_TOOL,
        postWorkPrompts: ["follow up work"],
      },
    });
    await runner.run(ctx);

    expect(callCount).toBe(2); // main + 1 postWorkPrompt

    // First call (main work) should have outputSchema
    const mainCallOpts = ((thread.runStreamed as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { outputSchema?: unknown }])[1];
    expect(mainCallOpts?.outputSchema).toBeDefined();

    // Second call (postWorkPrompt) should NOT have outputSchema
    const followCallOpts = ((thread.runStreamed as ReturnType<typeof vi.fn>).mock.calls[1] as [string, { outputSchema?: unknown }])[1];
    expect(followCallOpts).not.toHaveProperty("outputSchema");
  });
});
