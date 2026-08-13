/**
 * CodexAgentRunner — inactivity timeout tests (TC-003 and TC-014).
 *
 * TC-003: codex adapter の events ループも同じ無活動監視を持つ
 * TC-014: codex output-repair 中の watchdog 発火が outer catch に届き timeout として返る
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexInstance, CodexThread, CodexAgentRunnerDeps } from "../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

// Hardcoded constant matching DEFAULT_INACTIVITY_TIMEOUT_MS (15 minutes).
const INACTIVITY_THRESHOLD_MS = 900_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(): JobState {
  return {
    version: 1,
    jobId: "codex-inactivity-job",
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

function makeRunner(deps: CodexAgentRunnerDeps = {}): CodexAgentRunner {
  return new CodexAgentRunner({ _sleepFn: async () => {}, ...deps });
}

/** A CodexThread whose runStreamed never delivers events — blocks until abort. */
function makeHangingThread(): CodexThread {
  return {
    id: "thread-hanging",
    runStreamed: vi.fn().mockImplementation(
      (_prompt: string, opts?: { signal?: AbortSignal }) => {
        // Reject when the abort signal fires (same pattern as existing codex TC-03)
        return new Promise<never>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            reject(new Error("AbortError"));
          }, { once: true });
        });
      },
    ),
  };
}

/** A CodexThread that yields a successful turn immediately (items empty, finalResponse provided). */
function makeSuccessThread(finalResponse = "done"): CodexThread {
  async function* makeEventStream() {
    yield { type: "item.completed", item: { type: "agent_message", text: finalResponse } };
    yield { type: "turn.completed" };
  }
  return {
    id: "thread-success",
    runStreamed: vi.fn().mockResolvedValue({ events: makeEventStream() }),
  };
}

function makeCodexFactory(thread: CodexThread): () => CodexInstance {
  return vi.fn().mockReturnValue({
    startThread: vi.fn().mockReturnValue(thread),
    resumeThread: vi.fn().mockReturnValue(thread),
  });
}

// ---------------------------------------------------------------------------
// TC-003: codex adapter の events ループも同じ無活動監視を持つ
// ---------------------------------------------------------------------------

describe("TC-003: codex adapter の events ループも同じ無活動監視を持つ", () => {
  it(
    "returns completionReason==='timeout' and STEP_TIMEOUT when events loop produces no events within threshold",
    async () => {
      vi.useFakeTimers();

      const thread = makeHangingThread();
      const factory = makeCodexFactory(thread);
      const runner = makeRunner({ _codexFactory: factory });

      // No timeoutMs in config — inactivity watchdog is the only sentinel
      const runPromise = runner.run(makeCtx());

      // Advance past inactivity threshold
      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);

      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
      expect(result.resultContent).toBeNull();
    },
  );

  it(
    "error.message contains 'inactivity' and elapsed ms when inactivity fires",
    async () => {
      vi.useFakeTimers();

      const thread = makeHangingThread();
      const factory = makeCodexFactory(thread);
      const runner = makeRunner({ _codexFactory: factory });

      const runPromise = runner.run(makeCtx());
      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);
      const result = await runPromise;

      expect(result.completionReason).toBe("timeout");
      const errMsg = (result.error as { message?: string } | undefined)?.message ?? "";
      expect(errMsg.toLowerCase()).toContain("inactivity");
      expect(errMsg).toContain(String(INACTIVITY_THRESHOLD_MS));
    },
  );

  it(
    "events arriving before threshold keep inactivity timer from firing → success returned",
    async () => {
      vi.useFakeTimers();

      const thread = makeSuccessThread("done successfully");
      const factory = makeCodexFactory(thread);
      const runner = makeRunner({ _codexFactory: factory });

      const result = await runner.run(makeCtx());
      expect(result.completionReason).toBe("success");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-014: codex output-repair 中の watchdog 発火が outer catch に届き timeout として返る
// ---------------------------------------------------------------------------

describe("TC-014: codex output-repair 中の watchdog 発火が outer catch に届き timeout として返る", () => {
  it(
    "returns completionReason==='timeout' when watchdog fires during repair turn (abort not swallowed by catch{})",
    async () => {
      vi.useFakeTimers();

      let runStreamedCallCount = 0;

      // Thread that:
      // - Call 1 (main turn): resolves with a success event stream (sets threadId)
      // - Call 2 (repair turn): blocks until abort fires
      const thread: CodexThread = {
        id: "thread-codex-repair",
        runStreamed: vi.fn().mockImplementation(
          (_prompt: string, opts?: { signal?: AbortSignal }) => {
            runStreamedCallCount++;

            if (runStreamedCallCount === 1) {
              // Main turn: succeed immediately
              async function* mainStream() {
                yield { type: "item.completed", item: { type: "agent_message", text: "main done" } };
                yield { type: "turn.completed" };
              }
              return Promise.resolve({ events: mainStream() });
            } else {
              // Repair turn: block until abort
              return new Promise<never>((_resolve, reject) => {
                opts?.signal?.addEventListener("abort", () => {
                  reject(new Error("AbortError"));
                }, { once: true });
              });
            }
          },
        ),
      };

      const factory: () => CodexInstance = vi.fn().mockReturnValue({
        startThread: vi.fn().mockReturnValue(thread),
        resumeThread: vi.fn().mockReturnValue(thread),
      });
      const runner = makeRunner({ _codexFactory: factory });

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
        buildPrompt: vi.fn().mockReturnValue("repair prompt"),
      };

      const runPromise = runner.run(makeCtx({ policy: { outputVerification } }));

      // Main turn completes quickly; repair turn starts and blocks.
      // Advance past inactivity threshold to fire the watchdog.
      await vi.advanceTimersByTimeAsync(INACTIVITY_THRESHOLD_MS);

      const result = await runPromise;

      // Without T-03 implementation: repair catch{} swallows → success returned → test FAILS (red ✓)
      // With T-03 implementation: catch(err) + if(aborted) throw → outer catch → timeout (green ✓)
      expect(result.completionReason).toBe("timeout");
      expect((result.error as { code?: string } | undefined)?.code).toBe("STEP_TIMEOUT");
    },
  );
});
