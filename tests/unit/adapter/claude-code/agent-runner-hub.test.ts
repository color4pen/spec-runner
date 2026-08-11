/**
 * Tests for ClaudeCodeRunner + QueryAbortHub registration (T-06).
 *
 * TC-020: agent runner registers exactly one controller per run and deregisters on completion
 *
 * Tests are intentionally RED until:
 *   - ClaudeCodeRunnerDeps gains optional `queryAbortHub?: QueryAbortRegistration`
 *   - run() registers the per-call AbortController with the hub on entry
 *   - run() deregisters the controller on ALL exit paths (success, error, throw)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeRunner } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { QueryAbortRegistration } from "../../../../src/core/port/query-abort.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-runner-hub-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers (reuse minimal patterns from agent-runner.test.ts)
// ---------------------------------------------------------------------------

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "hub-test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
  } as unknown as JobState;
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-5",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeQueryFn(result: "success" | "error" = "success"): QueryFn {
  return async function* mockQuery() {
    if (result === "success") {
      yield {
        type: "result" as const,
        subtype: "success" as const,
        result: "done",
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    } else {
      yield {
        type: "result" as const,
        subtype: "error_during_execution" as const,
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: true,
        num_turns: 1,
        stop_reason: null,
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: ["test error"],
        uuid: "test-uuid",
        session_id: "test-session",
      } as unknown;
    }
  } as QueryFn;
}

function makeCtx(jobId = "hub-test-job"): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(jobId),
    branch: "feat/test",
    slug: "hub-test-slug",
    cwd: tempDir,
    input: { requestContent: "content" },
    session: {},
    policy: {},
    config: makeConfig(),
    emit: vi.fn(),
  } as unknown as AgentRunContext;
}

// ---------------------------------------------------------------------------
// Fake hub that captures register / deregister calls
// ---------------------------------------------------------------------------

interface FakeHubCall {
  type: "register" | "deregister";
  controller: AbortController;
}

function makeFakeHub(): { hub: QueryAbortRegistration; calls: FakeHubCall[] } {
  const calls: FakeHubCall[] = [];
  const hub: QueryAbortRegistration = {
    register(controller: AbortController): () => void {
      calls.push({ type: "register", controller });
      return () => {
        calls.push({ type: "deregister", controller });
      };
    },
  };
  return { hub, calls };
}

// ---------------------------------------------------------------------------
// TC-020: register exactly once, deregister exactly once on success
// ---------------------------------------------------------------------------

describe("TC-020: agent runner hub registration lifecycle", () => {
  it("TC-020 (success path): run() registers one controller and deregisters it on success", async () => {
    const { hub, calls } = makeFakeHub();
    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: makeQueryFn("success"),
      queryAbortHub: hub,
    });

    await runner.run(makeCtx("tc020-success"));

    const registerCalls = calls.filter((c) => c.type === "register");
    const deregisterCalls = calls.filter((c) => c.type === "deregister");

    expect(registerCalls).toHaveLength(1);
    expect(deregisterCalls).toHaveLength(1);
    // Must be the same controller
    expect(registerCalls[0]!.controller).toBe(deregisterCalls[0]!.controller);
  });

  it("TC-020 (error path): run() deregisters even when the query returns an error result", async () => {
    const { hub, calls } = makeFakeHub();
    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: makeQueryFn("error"),
      queryAbortHub: hub,
    });

    // error result may throw or return an error result — either way deregister must fire
    try {
      await runner.run(makeCtx("tc020-error"));
    } catch {
      // intentional — verify deregister still called
    }

    const deregisterCalls = calls.filter((c) => c.type === "deregister");
    expect(deregisterCalls).toHaveLength(1);
  });

  it("TC-020 (no hub): run() without queryAbortHub behaves unchanged (no throw)", async () => {
    // No queryAbortHub injected → existing tests stay green
    const runner = new ClaudeCodeRunner({
      cwd: tempDir,
      _queryFn: makeQueryFn("success"),
      // queryAbortHub omitted intentionally
    });

    const result = await runner.run(makeCtx("tc020-no-hub"));
    expect(result).toHaveProperty("completionReason");
  });
});
