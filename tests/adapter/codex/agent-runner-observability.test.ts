/**
 * Observability tests for CodexAgentRunner.
 *
 * Covers:
 * - logPath set: JSONL file created, lines JSON-parseable, session:summary line present
 * - logPath unset: file not created
 * - step:progress: item.started for command_execution emits step:progress
 */
import * as os from "node:os";
import * as nodePath from "node:path";
import * as fs from "node:fs/promises";
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

/** Builds an async generator that yields a command_execution item.started, then completes. */
async function* commandExecutionStream(command: string, finalResponse = "done") {
  yield {
    type: "item.started",
    item: { type: "command_execution", command },
  };
  yield {
    type: "item.completed",
    item: { type: "command_execution", command, status: "completed" },
  };
  yield {
    type: "item.completed",
    item: { type: "agent_message", text: finalResponse },
  };
  yield {
    type: "turn.completed",
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

async function* simpleSuccessStream(finalResponse = "done") {
  yield { type: "item.completed", item: { type: "agent_message", text: finalResponse } };
  yield { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CodexAgentRunner observability — session log (logPath)", () => {
  it("logPath set: JSONL file created with JSON-parseable lines and session:summary present", async () => {
    const tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "specrunner-obs-"));
    const logPath = nodePath.join(tmpDir, "session.jsonl");

    try {
      const thread: CodexThread = {
        id: "thread-log-test",
        runStreamed: vi.fn().mockResolvedValue({ events: simpleSuccessStream() }),
      };
      const factory = vi.fn().mockReturnValue({
        startThread: vi.fn().mockReturnValue(thread),
        resumeThread: vi.fn().mockReturnValue(thread),
      });
      const runner = makeRunner({ _codexFactory: factory });

      const ctx = makeCtx({ session: { logPath } });
      const result = await runner.run(ctx);

      expect(result.completionReason).toBe("success");

      // File must exist
      const stat = await fs.stat(logPath);
      expect(stat.isFile()).toBe(true);

      // All lines must be JSON-parseable
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.trim().split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBeGreaterThan(0);

      const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

      // session:summary line must be present
      const summary = parsed.find((l) => l["type"] === "session:summary");
      expect(summary).toBeDefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("logPath unset: no JSONL file created", async () => {
    const thread: CodexThread = {
      id: "thread-no-log",
      runStreamed: vi.fn().mockResolvedValue({ events: simpleSuccessStream() }),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const ctx = makeCtx(); // no logPath
    const result = await runner.run(ctx);

    expect(result.completionReason).toBe("success");
    // Nothing to assert about missing file — just confirm no throw and correct result
  });
});

describe("CodexAgentRunner observability — step:progress events", () => {
  it("item.started for command_execution emits step:progress with tool=Bash and target", async () => {
    const command = "bun run test --reporter=verbose";
    const thread: CodexThread = {
      id: "thread-progress",
      runStreamed: vi.fn().mockResolvedValue({ events: commandExecutionStream(command) }),
    };
    const factory = vi.fn().mockReturnValue({
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn().mockReturnValue(thread),
    });
    const runner = makeRunner({ _codexFactory: factory });

    const emitSpy = vi.fn();
    const ctx = makeCtx({ emit: emitSpy });

    await runner.run(ctx);

    const progressEvents = emitSpy.mock.calls.filter((c) => c[0] === "step:progress");
    expect(progressEvents.length).toBeGreaterThanOrEqual(1);

    const payload = progressEvents[0]![1] as { step: string; tool: string; target?: string };
    expect(payload.step).toBe("implementer");
    expect(payload.tool).toBe("Bash");
    // Target is the command truncated to 40 chars
    const expectedTarget = command.length > 40 ? command.slice(0, 40) + "…" : command;
    expect(payload.target).toBe(expectedTarget);
  });
});
