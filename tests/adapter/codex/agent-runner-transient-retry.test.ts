/**
 * Transient-retry tests for CodexAgentRunner.
 *
 * Covers:
 * - Main turn: 1 transient → success (step:retry emitted, transientRetryAttempts === 1)
 * - Main turn: persistent transient → all retries exhausted, error, maxRetries step:retry events
 * - Main turn: non-transient → 1 attempt, error, no step:retry
 * - maxRetries = 0 → 1 attempt, no step:retry, transientRetryAttempts absent from result
 * - Follow-up turn: main succeeds, first postWorkPrompts turn transient once then succeeds
 */
import { describe, it, expect, vi } from "vitest";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexThread, CodexAgentRunnerDeps } from "../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

// ---------------------------------------------------------------------------
// Helpers
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

function makeConfig(maxRetries = 3): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    transientRetry: { maxRetries, baseDelayMs: 10 },
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

/** Async generator that yields a successful turn. */
async function* successStream(finalResponse = "done") {
  yield { type: "item.completed", item: { type: "agent_message", text: finalResponse } };
  yield { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } };
}

/** Async generator that yields a turn.failed event (transient error). */
async function* transientFailStream(message: string) {
  yield { type: "turn.failed", error: { message } };
}

function makeRunner(deps: CodexAgentRunnerDeps = {}): CodexAgentRunner {
  return new CodexAgentRunner({ _sleepFn: async () => {}, ...deps });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CodexAgentRunner transient retry — main turn", () => {
  it("1 transient error then success: step:retry emitted once, transientRetryAttempts === 1", async () => {
    let callCount = 0;
    const thread: CodexThread = {
      id: "t1",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ events: transientFailStream("ConnectionRefused: unable to connect") });
        }
        return Promise.resolve({ events: successStream() });
      }),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });
    const ctx = makeCtx({ emit: emitSpy });

    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.transientRetryAttempts).toBe(1);

    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]![1]).toMatchObject({ step: "implementer", attempt: 1, maxRetries: 3 });
  });

  it("1 transient error (via throw shape) then success: transientRetryAttempts === 1", async () => {
    let callCount = 0;
    const thread: CodexThread = {
      id: "t2",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("fetch failed: network error"));
        }
        return Promise.resolve({ events: successStream() });
      }),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx({ emit: emitSpy }));

    expect(result.completionReason).toBe("success");
    expect(result.transientRetryAttempts).toBe(1);
    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents).toHaveLength(1);
  });

  it("persistent transient → maxRetries exhausted, error, transientRetryAttempts === maxRetries", async () => {
    const maxRetries = 3;
    const thread: CodexThread = {
      id: "t3",
      runStreamed: vi.fn().mockImplementation(() =>
        Promise.resolve({ events: transientFailStream("ConnectionRefused") }),
      ),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx({ emit: emitSpy, config: makeConfig(maxRetries) }));

    expect(result.completionReason).toBe("error");
    expect(result.transientRetryAttempts).toBe(maxRetries);

    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents).toHaveLength(maxRetries);
    // Total calls: maxRetries + 1
    expect((thread.runStreamed as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(maxRetries + 1);
  });

  it("non-transient error → 1 attempt, no step:retry, transientRetryAttempts === 0", async () => {
    const thread: CodexThread = {
      id: "t4",
      runStreamed: vi.fn().mockRejectedValue(new Error("Unknown fatal error — not transient")),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx({ emit: emitSpy }));

    expect(result.completionReason).toBe("error");
    expect(result.transientRetryAttempts).toBe(0);

    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents).toHaveLength(0);
    expect((thread.runStreamed as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("maxRetries = 0 → 1 attempt, no step:retry, transientRetryAttempts absent from result", async () => {
    const thread: CodexThread = {
      id: "t5",
      runStreamed: vi.fn().mockRejectedValue(new Error("ConnectionRefused")),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const result = await runner.run(makeCtx({ emit: emitSpy, config: makeConfig(0) }));

    expect(result.completionReason).toBe("error");
    // transientRetryAttempts must be absent when maxRetries === 0
    expect("transientRetryAttempts" in result).toBe(false);

    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents).toHaveLength(0);
    expect((thread.runStreamed as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("CodexAgentRunner transient retry — follow-up turn", () => {
  it("main succeeds; first postWorkPrompts turn transient once then succeeds → success, transientRetryAttempts ≥ 1, ≥1 step:retry", async () => {
    let callCount = 0;
    const thread: CodexThread = {
      id: "t6",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // main turn: success
          return Promise.resolve({ events: successStream("main done") });
        }
        if (callCount === 2) {
          // first follow-up attempt: transient
          return Promise.resolve({ events: transientFailStream("ConnectionRefused") });
        }
        // second follow-up attempt: success
        return Promise.resolve({ events: successStream("follow done") });
      }),
    };

    const emitSpy = vi.fn();
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ emit: emitSpy, policy: { postWorkPrompts: ["cleanup"] } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    expect(result.transientRetryAttempts).toBeGreaterThanOrEqual(1);

    const retryEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:retry");
    expect(retryEvents.length).toBeGreaterThanOrEqual(1);
  });
});
