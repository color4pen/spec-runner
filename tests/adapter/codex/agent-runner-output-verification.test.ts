/**
 * Output-verification repair loop tests for CodexAgentRunner.
 *
 * Covers:
 * - follow-up violation → repair turn runs on same thread → completionReason === "success"
 * - repair turn failure → best-effort: result reflects work turn (no halt)
 */
import { describe, it, expect, vi } from "vitest";
import { CodexAgentRunner } from "../../../src/adapter/codex/agent-runner.js";
import type { CodexThread, CodexAgentRunnerDeps } from "../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { OutputVerificationPolicy } from "../../../src/core/port/output-contract.js";

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

function makeConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    transientRetry: { maxRetries: 0 },
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

async function* successStream(finalResponse = "done") {
  yield { type: "item.completed", item: { type: "agent_message", text: finalResponse } };
  yield { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CodexAgentRunner output verification repair loop", () => {
  it("follow-up violation on first detect → repair turn runs → second detect clears → completionReason === success", async () => {
    let detectCallCount = 0;
    const mockDetect = vi.fn().mockImplementation(async () => {
      detectCallCount++;
      if (detectCallCount === 1) {
        // First detect: one follow-up violation
        return {
          violations: [
            { kind: "tasks-complete", path: "tasks.md", policy: "follow-up", detail: ["task 1"] },
          ],
        };
      }
      // Second detect: no violations
      return { violations: [] };
    });

    const outputVerification: OutputVerificationPolicy = {
      detect: mockDetect,
      maxAttempts: 3,
      buildPrompt: vi.fn().mockReturnValue("Please complete all tasks"),
    };

    let callCount = 0;
    const thread: CodexThread = {
      id: "thread-ov-test",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ events: successStream(`turn ${callCount}`) });
      }),
    };

    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { outputVerification } });
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // Main turn (1) + repair turn (1) = 2 total runStreamed calls
    expect(callCount).toBe(2);
    // detect called twice: once finds violation, once clears
    expect(detectCallCount).toBe(2);
    expect(outputVerification.buildPrompt).toHaveBeenCalledTimes(1);
  });

  it("repair turn failure is best-effort: completionReason === success (work turn result preserved)", async () => {
    const mockDetect = vi.fn().mockResolvedValue({
      violations: [
        { kind: "tasks-complete", path: "tasks.md", policy: "follow-up", detail: ["task 1"] },
      ],
    });

    const outputVerification: OutputVerificationPolicy = {
      detect: mockDetect,
      maxAttempts: 3,
      buildPrompt: vi.fn().mockReturnValue("Please complete all tasks"),
    };

    const stderrLines: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    let callCount = 0;
    const thread: CodexThread = {
      id: "thread-ov-fail",
      runStreamed: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Main turn: success
          return Promise.resolve({ events: successStream("main done") });
        }
        // Repair turns: fail
        return Promise.reject(new Error("network failure in repair"));
      }),
    };

    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx({ policy: { outputVerification } });
    const result = await runner.run(ctx);

    // Work turn result is preserved despite repair failure
    expect(result.completionReason).toBe("success");
    // At least one warning was emitted
    expect(stderrLines.some((l) => l.includes("repair") || l.includes("verification") || l.includes("warn"))).toBe(true);

    stderrSpy.mockRestore();
  });
});
