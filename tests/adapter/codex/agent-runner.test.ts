/**
 * Unit tests for CodexAgentRunner
 */
import * as os from "node:os";
import * as nodePath from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexInstance, CodexThread } from "../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { DynamicContext } from "../../../src/git/dynamic-context.js";

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
    anthropic: { apiKey: "" },
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
    requestContent: "# Request\nDo something",
    config: makeConfig(),
    emit: vi.fn(),
    ...overrides,
  };
}

function makeThread(turnResult: {
  finalResponse: string;
  items?: unknown[];
  usage?: unknown;
}): CodexThread {
  return {
    run: vi.fn().mockResolvedValue({
      finalResponse: turnResult.finalResponse,
      items: turnResult.items ?? [],
      usage: turnResult.usage ?? null,
    }),
  };
}

function makeCodexFactory(thread: CodexThread): (opts: { apiKey: string }) => CodexInstance {
  return vi.fn().mockReturnValue({
    startThread: vi.fn().mockReturnValue(thread),
  });
}

describe("CodexAgentRunner", () => {
  it("implements AgentRunner interface (has run method)", () => {
    const runner = new CodexAgentRunner({ apiKey: "sk-test" });
    expect(typeof runner.run).toBe("function");
  });

  it("returns success with finalResponse when resultFilePath is null", async () => {
    const thread = makeThread({ finalResponse: "done!" });
    const factory = makeCodexFactory(thread);
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

    const result = await runner.run(makeCtx());
    expect(result.completionReason).toBe("success");
    expect(result.resultContent).toBe("done!");
  });

  it("passes workingDirectory as cwd to startThread", async () => {
    const thread = makeThread({ finalResponse: "" });
    const mockStartThread = vi.fn().mockReturnValue(thread);
    const factory = vi.fn().mockReturnValue({ startThread: mockStartThread });
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

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
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

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
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

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
        run: vi.fn().mockRejectedValue(new Error("network failure")),
      }),
    });
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

    const result = await runner.run(makeCtx());
    expect(result.completionReason).toBe("error");
    expect(result.error?.message).toContain("network failure");
    expect((result.error as { code?: string })?.code).toBe("CODEX_SDK_ERROR");
  });

  it("includes branch, slug, and projectContext in prompt via additionalInstructions", async () => {
    const thread = makeThread({ finalResponse: "" });
    const mockRun = thread.run as ReturnType<typeof vi.fn>;
    const factory = makeCodexFactory(thread);
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

    await runner.run(makeCtx({
      branch: "feat/my-feature",
      slug: "my-feature",
      projectContext: "<project context text>",
    }));

    const promptPassed = (mockRun.mock.calls[0] as [string])[0];
    expect(promptPassed).toContain("feat/my-feature");
    expect(promptPassed).toContain("my-feature");
    expect(promptPassed).toContain("<project context text>");
  });

  it("returns RESULT_FILE_NOT_FOUND error when result file is missing", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

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
      const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

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
  it("returns timeout when timeoutMs fires before thread.run resolves", async () => {
    vi.useFakeTimers();
    try {
      let abortReject: ((e: Error) => void) | undefined;
      const thread: CodexThread = {
        run: vi.fn().mockImplementation((_prompt: string, opts?: { signal?: AbortSignal }) => {
          return new Promise<never>((_resolve, reject) => {
            abortReject = reject;
            opts?.signal?.addEventListener("abort", () => {
              reject(new Error("AbortError"));
            });
          });
        }),
      };
      const mockStartThread = vi.fn().mockReturnValue(thread);
      const factory = vi.fn().mockReturnValue({ startThread: mockStartThread });
      const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

      const config: SpecRunnerConfig = { ...makeConfig(), steps: { implementer: { timeoutMs: 100 } } };
      const runPromise = runner.run(makeCtx({ config }));

      await vi.advanceTimersByTimeAsync(100);

      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string })?.code).toBe("STEP_TIMEOUT");
      expect(result.resultContent).toBeNull();

      // suppress unused-variable warning
      void abortReject;
    } finally {
      vi.useRealTimers();
    }
  });

  // TC-08: enrichContext called before buildMessage, enriched context passed through
  it("calls enrichContext before buildMessage and passes enriched dynamicContext", async () => {
    const thread = makeThread({ finalResponse: "" });
    const factory = makeCodexFactory(thread);
    const runner = new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory });

    const initialDynamicCtx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [],
    };
    const enrichedDynamicCtx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      specIndex: [],
      baselineSpecs: { "test-capability": "# Baseline spec content" },
    };

    const enrichContext = vi.fn().mockResolvedValue(enrichedDynamicCtx);
    const buildMessage = vi.fn().mockReturnValue("build message result");

    const step = makeAgentStep({ enrichContext, buildMessage });
    const ctx = makeCtx({ step, dynamicContext: initialDynamicCtx });

    await runner.run(ctx);

    expect(enrichContext).toHaveBeenCalledTimes(1);

    // buildMessage receives StepContext (StepDeps) as second argument
    const stepCtxArg = buildMessage.mock.calls[0]?.[1] as { dynamicContext?: DynamicContext };
    expect(stepCtxArg?.dynamicContext).toEqual(enrichedDynamicCtx);
    expect(stepCtxArg?.dynamicContext).not.toEqual(initialDynamicCtx);
  });
});
