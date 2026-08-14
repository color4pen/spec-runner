/**
 * Integration tests: claude-code runner STEP_TIMEOUT carries last-tool observation.
 * Also covers: isToolResult guard, hint persistence, existing behavior invariants.
 *
 * TC-005: tool_use observed then stream goes silent — error.hint contains in-flight info
 * TC-006: tool_result observed before the silence — error.hint indicates completed
 * TC-007: no tool_use observed before timeout — error.hint contains "no tool observed"
 * TC-011: hint survives into the step-attempt error record (makeTimeoutHalt unit)
 * TC-012: timeout still transitions to awaiting-resume (makeTimeoutHalt unit)
 * TC-013: inactivity message text is unchanged — hint is in hint field, not message
 * TC-014: isToolResult returns true for a valid tool_result message
 * TC-015: isToolResult returns false for non-tool_result messages
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../agent-runner.js";
import type { QueryFn } from "../agent-runner.js";
import { isToolResult } from "../message-types.js";
import { makeTimeoutHalt } from "../../../core/step/step-halt.js";
import { DEFAULT_INACTIVITY_TIMEOUT_MS, formatInactivityTimeoutMessage } from "../../shared/inactivity-watchdog.js";
import { ADDED_TURNS_ZERO } from "../../../core/port/agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-timeout-last-tool-test-"));
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
  // No steps.timeoutMs → timeoutMs defaults to null → no wall-clock timeout.
  // Only the inactivity watchdog fires in these tests.
  return { version: 1, runtime: "local", agents: {} };
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
  };
}

/** Minimal tool_use stream event for Bash with a command input. */
function bashToolUseEvent(id = "tu-1", command = "bun test"): unknown {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Bash", id, input: { command } },
    },
  };
}

/** Minimal tool_result user message. */
function toolResultMessage(toolUseId = "tu-1"): unknown {
  return {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: "ok" }],
    },
  };
}

/**
 * Build a queryFn that yields the given messages, then hangs until the
 * AbortController (from queryOptions.abortController) fires.
 * This lets vi.advanceTimersByTimeAsync fire the inactivity watchdog.
 */
function hangingQueryFn(messages: unknown[]): QueryFn {
  return async function* (params) {
    const opts = params.options as { abortController?: AbortController } | undefined;
    const signal = opts?.["abortController"]?.signal;
    for (const msg of messages) {
      yield msg;
    }
    // Hang until aborted — the inactivity watchdog fires and aborts the controller.
    await new Promise<void>((_, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("aborted"));
        return;
      }
      signal?.addEventListener("abort", () =>
        reject(signal?.reason ?? new Error("aborted")),
      );
    });
  };
}

// ---------------------------------------------------------------------------
// TC-005: tool_use observed then stream goes silent
// ---------------------------------------------------------------------------

describe("TC-005: tool_use observed then stream goes silent — error.hint contains in-flight info", () => {
  it("error.hint contains tool name, target, elapsed, and in-flight marker", async () => {
    vi.useFakeTimers();

    const queryFn = hangingQueryFn([bashToolUseEvent("tu-1", "bun test")]);
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-005")));

    // Two-step: first allow async setup (buildArtifactBundle) and the generator to start
    // and process messages, then fire the watchdog. A single advance at 900000ms fires
    // the timer before setup completes (throwIfAborted() at runQuery entry would catch it
    // before the generator yields any messages).
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("Bash");
    expect(error.hint).toContain("bun test");
    expect(error.hint).toContain("in-flight");
    expect(error.hint).not.toContain("completed before timeout");
  });
});

// ---------------------------------------------------------------------------
// TC-006: tool_result observed before the silence
// ---------------------------------------------------------------------------

describe("TC-006: tool_result observed before the silence — error.hint indicates completed", () => {
  it("error.hint contains completed marker, not in-flight", async () => {
    vi.useFakeTimers();

    const queryFn = hangingQueryFn([
      bashToolUseEvent("tu-1", "bun test"),
      toolResultMessage("tu-1"),
    ]);
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-006")));

    // Two-step: let setup complete and generator process both messages, then fire watchdog.
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
// TC-007: no tool_use observed before timeout
// ---------------------------------------------------------------------------

describe("TC-007: no tool_use observed before timeout — error.hint contains 'no tool observed'", () => {
  it("error.hint contains 'no tool observed' marker", async () => {
    vi.useFakeTimers();

    // Yield nothing useful — just hang immediately
    const queryFn = hangingQueryFn([]);
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const resultPromise = runner.run(makeCtx(makeAgentStep(), makeJobState("tc-007")));

    // Two-step: let setup and generator start (nothing to yield), then fire watchdog.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.completionReason).toBe("timeout");
    const error = result.error as Error & { code?: string; hint?: string };
    expect(error.code).toBe("STEP_TIMEOUT");
    expect(error.hint).toContain("no tool observed");
  });
});

// ---------------------------------------------------------------------------
// TC-011: hint survives into the step-attempt error record
// ---------------------------------------------------------------------------

describe("TC-011: hint on STEP_TIMEOUT error is preserved in ErrorInfo.hint by makeTimeoutHalt", () => {
  it("makeTimeoutHalt copies error.hint into ErrorInfo.hint unchanged", () => {
    const observationHint =
      "last tool: Bash bun test started 5000ms ago; in-flight (no completion observed before timeout)";
    const timeoutError = Object.assign(new Error("timeout message"), {
      code: "STEP_TIMEOUT",
      hint: observationHint,
    });
    const runResult = {
      completionReason: "timeout" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
      error: timeoutError,
      addedTurns: ADDED_TURNS_ZERO,
    };
    const halt = makeTimeoutHalt(runResult, "implementer");
    expect(halt.error.hint).toBe(observationHint);
  });

  it("makeTimeoutHalt with no hint produces empty hint string", () => {
    const timeoutError = Object.assign(new Error("timeout"), { code: "STEP_TIMEOUT" });
    const runResult = {
      completionReason: "timeout" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
      error: timeoutError,
      addedTurns: ADDED_TURNS_ZERO,
    };
    const halt = makeTimeoutHalt(runResult, "implementer");
    expect(halt.error.hint).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-012: timeout still transitions to awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-012: timeout still transitions to awaiting-resume", () => {
  it("makeTimeoutHalt produces kind=awaiting-resume halt with interruption reason timeout", () => {
    const timeoutError = Object.assign(new Error("timed out"), {
      code: "STEP_TIMEOUT",
      hint: "some hint",
    });
    const runResult = {
      completionReason: "timeout" as const,
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
      error: timeoutError,
      addedTurns: ADDED_TURNS_ZERO,
    };
    const halt = makeTimeoutHalt(runResult, "implementer");
    expect(halt.kind).toBe("awaiting-resume");
    expect(halt.resumePoint.reason).toBe("timeout");
    expect(halt.interruption.reason).toBe("timeout");
    expect(halt.error.code).toBe("STEP_TIMEOUT");
  });
});

// ---------------------------------------------------------------------------
// TC-013: inactivity message text is unchanged — observation lives in hint only
// ---------------------------------------------------------------------------

describe("TC-013: inactivity message text is unchanged; hint is separate from message", () => {
  it("error.message equals formatInactivityTimeoutMessage output, not modified by hint", async () => {
    vi.useFakeTimers();

    const stepName = "implementer";
    const queryFn = hangingQueryFn([bashToolUseEvent("tu-1", "bun test")]);
    const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
    const resultPromise = runner.run(makeCtx(makeAgentStep(stepName), makeJobState("tc-013")));

    // Two-step: let setup complete first, then fire the watchdog.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS);
    const result = await resultPromise;

    const error = result.error as Error & { code?: string; hint?: string };
    // message must match the original formatInactivityTimeoutMessage output exactly
    const expectedMessage = formatInactivityTimeoutMessage(stepName, DEFAULT_INACTIVITY_TIMEOUT_MS);
    expect(error.message).toBe(expectedMessage);
    // hint is non-empty and separate from message
    expect(error.hint).toBeTruthy();
    expect(error.message).not.toContain(error.hint ?? "");
  });
});

// ---------------------------------------------------------------------------
// TC-014: isToolResult returns true for a valid tool_result message
// ---------------------------------------------------------------------------

describe("TC-014: isToolResult returns true for a valid tool_result message", () => {
  it("user message with tool_result content block → true", () => {
    const msg = {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "done" }],
      },
    };
    expect(isToolResult(msg)).toBe(true);
  });

  it("user message with multiple blocks including tool_result → true", () => {
    const msg = {
      type: "user",
      message: {
        content: [
          { type: "text", text: "some text" },
          { type: "tool_result", tool_use_id: "tu-2" },
        ],
      },
    };
    expect(isToolResult(msg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015: isToolResult returns false for non-tool_result messages
// ---------------------------------------------------------------------------

describe("TC-015: isToolResult returns false for non-tool_result messages", () => {
  it("tool_use stream_event → false", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_start", content_block: { type: "tool_use", name: "Bash" } },
    };
    expect(isToolResult(msg)).toBe(false);
  });

  it("assistant message → false", () => {
    const msg = { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } };
    expect(isToolResult(msg)).toBe(false);
  });

  it("result type message → false", () => {
    const msg = { type: "result", subtype: "success", result: "done" };
    expect(isToolResult(msg)).toBe(false);
  });

  it("malformed object missing required fields → false", () => {
    expect(isToolResult(null)).toBe(false);
    expect(isToolResult(undefined)).toBe(false);
    expect(isToolResult({})).toBe(false);
    expect(isToolResult({ type: "user" })).toBe(false);
  });

  it("user message whose content contains only non-tool_result blocks → false", () => {
    const msg = {
      type: "user",
      message: {
        content: [{ type: "text", text: "just text" }],
      },
    };
    expect(isToolResult(msg)).toBe(false);
  });

  it("user message with empty content array → false", () => {
    const msg = { type: "user", message: { content: [] } };
    expect(isToolResult(msg)).toBe(false);
  });
});
