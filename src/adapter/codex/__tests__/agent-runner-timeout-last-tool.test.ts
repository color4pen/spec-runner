/**
 * Integration tests: codex runner STEP_TIMEOUT carries last-tool observation.
 *
 * TC-008: item.started observed then stream goes silent — error.hint contains in-flight info
 * TC-009: item.completed observed before the silence — error.hint indicates completed
 * TC-010: only non-tool items observed before timeout — error.hint contains "no tool observed"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CodexAgentRunner } from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import { DEFAULT_INACTIVITY_TIMEOUT_MS } from "../../shared/inactivity-watchdog.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-timeout-last-tool-test-"));
});

afterEach(async () => {
  vi.useRealTimers();
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

function makeConfig(): SpecRunnerConfig {
  // No steps.timeoutMs → wall-clock timeout defaults to null → only watchdog fires.
  return { version: 1, runtime: "local", agents: {} };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "gpt-5.5",
      system: "implement this",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(step: AgentStep, state: JobState): AgentRunContext {
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
  } as AgentRunContext;
}

type CodexThreadEvent = { type: string; [key: string]: unknown };

/**
 * Build a mock CodexThread that yields the given events, then hangs until
 * the abort signal fires. The hang causes the inactivity watchdog to eventually fire.
 */
function makeHangingThread(preEvents: CodexThreadEvent[]): CodexThread {
  return {
    id: "mock-thread-id",
    runStreamed: async (_prompt: string, opts?: { signal?: AbortSignal }) => {
      const signal = opts?.signal;
      async function* gen(): AsyncGenerator<CodexThreadEvent> {
        for (const ev of preEvents) {
          yield ev;
        }
        // Hang until the abort controller fires (inactivity watchdog).
        await new Promise<void>((_, reject) => {
          if (signal?.aborted) {
            reject(signal.reason ?? new Error("aborted"));
            return;
          }
          signal?.addEventListener("abort", () =>
            reject(signal?.reason ?? new Error("aborted")),
          );
        });
      }
      return { events: gen() };
    },
  };
}

function makeMockCodexInstance(thread: CodexThread): CodexInstance {
  return {
    startThread: (_opts) => thread,
    resumeThread: (_threadId) => thread,
  };
}

/** A command_execution item.started event with a command string. */
function commandStartedEvent(id: string, command: string): CodexThreadEvent {
  return {
    type: "item.started",
    item: { type: "command_execution", id, command },
  };
}

/** A command_execution item.completed event (matching a started event). */
function commandCompletedEvent(id: string, command: string): CodexThreadEvent {
  return {
    type: "item.completed",
    item: { type: "command_execution", id, command, status: "completed" },
  };
}

/** A non-tool agent_message item.started event (no progress representation). */
function agentMessageStartedEvent(): CodexThreadEvent {
  return {
    type: "item.started",
    item: { type: "agent_message", id: "msg-1", text: "thinking..." },
  };
}

// ---------------------------------------------------------------------------
// TC-008: item.started observed then stream goes silent
// ---------------------------------------------------------------------------

describe("TC-008: item.started observed then stream goes silent — error.hint contains in-flight info", () => {
  it("error.hint contains tool name, command target, elapsed, and in-flight marker", async () => {
    vi.useFakeTimers();

    const thread = makeHangingThread([commandStartedEvent("item-1", "bun test")]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-008")));

    // Two-step: let async setup (buildArtifactBundle) complete and generator start
    // before firing the watchdog. A single advance at 900000ms fires before setup
    // completes, so abort happens before any events are observed.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("Bash");
    // extractCodexProgress maps command_execution to Bash; target is first 40 chars of command
    expect(error.hint).toContain("bun test");
    expect(error.hint).toContain("in-flight");
    expect(error.hint).not.toContain("completed before timeout");
  });
});

// ---------------------------------------------------------------------------
// TC-009: item.completed observed before the silence
// ---------------------------------------------------------------------------

describe("TC-009: item.completed observed before the silence — error.hint indicates completed", () => {
  it("error.hint contains completed marker, not in-flight", async () => {
    vi.useFakeTimers();

    const thread = makeHangingThread([
      commandStartedEvent("item-1", "bun test"),
      commandCompletedEvent("item-1", "bun test"),
    ]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-009")));

    // Two-step: let setup complete and generator process both events, then fire watchdog.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("Bash");
    expect(error.hint).toContain("completed before timeout");
    expect(error.hint).not.toContain("in-flight");
  });
});

// ---------------------------------------------------------------------------
// TC-010: only non-tool items observed before timeout
// ---------------------------------------------------------------------------

describe("TC-010: only non-tool items observed before timeout — error.hint contains 'no tool observed'", () => {
  it("error.hint contains 'no tool observed' when only agent_message items arrived", async () => {
    vi.useFakeTimers();

    // Only an agent_message item — extractCodexProgress returns null for agent_message
    const thread = makeHangingThread([agentMessageStartedEvent()]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-010")));

    // Two-step: let setup complete and generator process the non-tool event, then fire watchdog.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("no tool observed");
  });

  it("error.hint contains 'no tool observed' when no events arrived at all", async () => {
    vi.useFakeTimers();

    const thread = makeHangingThread([]); // no events
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-010b")));

    // Two-step: let setup complete and generator start (immediately hangs), then fire watchdog.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("no tool observed");
  });
});
