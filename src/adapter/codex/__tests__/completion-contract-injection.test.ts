/**
 * Tests for T-04: main-turn injection, single-source, durable diagnostics, no regression.
 *
 * Acceptance criteria:
 * - Main-turn prompt contains COMPLETION_REPORT_MEANS when reportTool is set.
 * - Main-turn prompt does NOT contain COMPLETION_REPORT_MEANS when reportTool is unset.
 * - buildMainTurnCompletionInstruction() and buildCompletionRetryPrompt() both contain COMPLETION_REPORT_MEANS.
 * - buildCompletionRetryPrompt(1, 2) equals the previously inlined literal.
 * - completionReportDiagnostics is non-empty when all turns fail.
 * - completionReportDiagnostics is absent when main turn succeeds.
 * - Journal propagation: pushStepResult records it; absent → key absent; stepRunToRecord serializes it; fold() restores it.
 * - outputSchema is still injected when reportTool is set (no regression).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  CodexAgentRunner,
  COMPLETION_REPORT_MEANS,
  buildMainTurnCompletionInstruction,
  buildCompletionRetryPrompt,
} from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import type { ReportToolSpec, BaseReportResult } from "../../../core/port/report-result.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import { string } from "zod/v4-mini";
import { pushStepResult } from "../../../state/helpers.js";
import { stepRunToRecord, fold } from "../../../store/event-journal.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TestReportResult extends BaseReportResult {
  verdict: string;
}

const mockReportTool: ReportToolSpec<TestReportResult> = {
  name: "report_result",
  description: "Report completion",
  zodSchema: { verdict: string() },
  parseInput: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, missingFields: ["verdict"], rawInput: raw };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj["verdict"] !== "string") {
      return { ok: false, missingFields: ["verdict"], rawInput: raw };
    }
    return { ok: true, value: { ok: true, verdict: obj["verdict"] } as TestReportResult };
  },
};

const VALID_JSON = JSON.stringify({ verdict: "approved" });

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "request-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "request-review",
    agent: {
      name: "specrunner-request-review",
      role: "request-review",
      model: "gpt-5.5",
      system: "review this request",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review the request",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

// ---------------------------------------------------------------------------
// Mock thread builders that capture call arguments
// ---------------------------------------------------------------------------

interface CapturedCall {
  prompt: string;
  opts?: { signal?: AbortSignal; outputSchema?: unknown };
}

/** Build a mock thread that records each runStreamed call. */
function makeCapturingMockThread(responses: string[]): { thread: CodexThread; calls: CapturedCall[] } {
  let callCount = 0;
  const calls: CapturedCall[] = [];

  const thread: CodexThread = {
    id: "mock-thread-id",
    runStreamed: async (prompt: string, opts?: { signal?: AbortSignal; outputSchema?: unknown }) => {
      const idx = Math.min(callCount, responses.length - 1);
      const responseText = responses[idx]!;
      callCount++;
      calls.push({ prompt, opts });

      async function* generate() {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: responseText },
        };
        yield { type: "turn.completed" };
      }

      return { events: generate() };
    },
  };

  return { thread, calls };
}

function makeMockCodexInstance(thread: CodexThread): CodexInstance {
  return {
    startThread: (_opts) => thread,
    resumeThread: (_threadId) => thread,
  };
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-contract-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeCtx(
  thread: CodexThread,
  extraPolicy: Partial<AgentRunContext["policy"]> = {},
): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {
      reportTool: mockReportTool,
      ...extraPolicy,
    },
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

// ---------------------------------------------------------------------------
// T-04: Single-source assertions
// ---------------------------------------------------------------------------

describe("Single-source: COMPLETION_REPORT_MEANS", () => {
  it("buildMainTurnCompletionInstruction() contains COMPLETION_REPORT_MEANS", () => {
    const instruction = buildMainTurnCompletionInstruction();
    expect(instruction).toContain(COMPLETION_REPORT_MEANS);
  });

  it("buildCompletionRetryPrompt(1, 2) contains COMPLETION_REPORT_MEANS", () => {
    const prompt = buildCompletionRetryPrompt(1, 2);
    expect(prompt).toContain(COMPLETION_REPORT_MEANS);
  });

  it("buildCompletionRetryPrompt(1, 2) equals the previously inlined literal", () => {
    const expected =
      `前の応答から JSON を取得できませんでした。${COMPLETION_REPORT_MEANS} (attempt 1/2)`;
    expect(buildCompletionRetryPrompt(1, 2)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// T-04: Main-turn injection
// ---------------------------------------------------------------------------

describe("Main-turn injection: COMPLETION_REPORT_MEANS in prompt", () => {
  it("reportTool set → main-turn prompt contains COMPLETION_REPORT_MEANS", async () => {
    const { thread, calls } = makeCapturingMockThread([VALID_JSON]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx(thread, { reportTool: mockReportTool }));

    // calls[0] is the main work turn
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain(COMPLETION_REPORT_MEANS);
  });

  it("reportTool unset → main-turn prompt does NOT contain COMPLETION_REPORT_MEANS", async () => {
    const { thread, calls } = makeCapturingMockThread(["some prose"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    // No reportTool
    await runner.run(makeCtx(thread, { reportTool: undefined }));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).not.toContain(COMPLETION_REPORT_MEANS);
  });

  it("reportTool set → main-turn opts still include outputSchema (no regression)", async () => {
    const { thread, calls } = makeCapturingMockThread([VALID_JSON]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx(thread, { reportTool: mockReportTool }));

    expect(calls[0]!.opts?.outputSchema).toBeDefined();
  });

  it("reportTool unset → main-turn opts do NOT include outputSchema", async () => {
    const { thread, calls } = makeCapturingMockThread(["some prose"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx(thread, { reportTool: undefined }));

    expect(calls[0]!.opts?.outputSchema).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-04: Diagnostics on result
// ---------------------------------------------------------------------------

describe("completionReportDiagnostics on AgentRunResult", () => {
  it("all turns fail → completionReportDiagnostics is non-empty with failureReason and rawFragment", async () => {
    const prose = "This is plain text. No JSON here at all.";
    // main + 2 retries (DEFAULT_TOOL_RETRY.maxAttempts = 2) all return prose
    const { thread } = makeCapturingMockThread([prose, prose, prose]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    expect(result.completionReportDiagnostics).toBeDefined();
    expect(result.completionReportDiagnostics!.length).toBeGreaterThan(0);
    for (const diag of result.completionReportDiagnostics!) {
      expect(diag.failureReason).toBeTruthy();
      expect(diag.rawFragment).toBeTruthy();
    }
  });

  it("all turns fail → diagnostics include a main-phase entry", async () => {
    const prose = "plain prose no json";
    const { thread } = makeCapturingMockThread([prose, prose, prose]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    const mainDiag = result.completionReportDiagnostics?.find((d) => d.phase === "main");
    expect(mainDiag).toBeDefined();
  });

  it("all turns fail → retry-phase entries carry attempt number", async () => {
    const prose = "plain prose no json";
    const { thread } = makeCapturingMockThread([prose, prose, prose]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    const retryDiags = result.completionReportDiagnostics?.filter((d) => d.phase === "retry") ?? [];
    for (const d of retryDiags) {
      expect(d.attempt).toBeDefined();
      expect(typeof d.attempt).toBe("number");
    }
  });

  it("main turn returns valid JSON → completionReportDiagnostics absent from result", async () => {
    const { thread } = makeCapturingMockThread([VALID_JSON]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    expect(result.completionReportDiagnostics).toBeUndefined();
    expect("completionReportDiagnostics" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-04: Journal propagation (mirrors transient-retry-state.test.ts)
// ---------------------------------------------------------------------------

function makeStateForJournal(): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

describe("Journal propagation: completionReportDiagnostics", () => {
  it("pushStepResult with completionReportDiagnostics records it in outcome", () => {
    const state = makeStateForJournal();
    const diags = [{ phase: "main" as const, failureReason: "no-json-found", rawFragment: "abc" }];
    const result = pushStepResult(state, "design", {
      verdict: "success",
      findingsPath: null,
      error: null,
      completionReportDiagnostics: diags,
    });

    const run = result.steps?.["design"]?.[0];
    expect(run).toBeDefined();
    expect(run!.outcome.completionReportDiagnostics).toEqual(diags);
  });

  it("pushStepResult without completionReportDiagnostics → key absent in outcome", () => {
    const state = makeStateForJournal();
    const result = pushStepResult(state, "design", {
      verdict: "success",
      findingsPath: null,
      error: null,
      // completionReportDiagnostics intentionally omitted
    });

    const run = result.steps?.["design"]?.[0];
    expect(run).toBeDefined();
    expect("completionReportDiagnostics" in run!.outcome).toBe(false);
  });

  it("stepRunToRecord serializes completionReportDiagnostics", () => {
    const state = makeStateForJournal();
    const diags = [{ phase: "retry" as const, attempt: 1, failureReason: "json-parse-error", rawFragment: "xyz" }];
    const withResult = pushStepResult(state, "design", {
      verdict: "success",
      findingsPath: null,
      error: null,
      completionReportDiagnostics: diags,
    });
    const run = withResult.steps!["design"]![0]!;
    const record = stepRunToRecord("design", run);

    expect(record.outcome.completionReportDiagnostics).toEqual(diags);
  });

  it("stepRunToRecord: absent in run → absent in record", () => {
    const state = makeStateForJournal();
    const withResult = pushStepResult(state, "design", {
      verdict: "success",
      findingsPath: null,
      error: null,
    });
    const run = withResult.steps!["design"]![0]!;
    const record = stepRunToRecord("design", run);

    expect("completionReportDiagnostics" in record.outcome).toBe(false);
  });

  it("fold() restores completionReportDiagnostics from journal line", () => {
    const diags = [{ phase: "main" as const, failureReason: "validation-failed", rawFragment: "oops" }];
    const line = JSON.stringify({
      type: "step-attempt",
      step: "design",
      sessionId: null,
      outcome: {
        verdict: "success",
        findingsPath: null,
        error: null,
        completionReportDiagnostics: diags,
      },
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const result = fold(line);
    const run = result.steps["design"]?.[0];
    expect(run).toBeDefined();
    expect(run!.outcome.completionReportDiagnostics).toEqual(diags);
  });

  it("fold() on legacy journal (no field) → field absent", () => {
    const line = JSON.stringify({
      type: "step-attempt",
      step: "design",
      sessionId: null,
      outcome: {
        verdict: "success",
        findingsPath: null,
        error: null,
        // completionReportDiagnostics absent — legacy record
      },
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const result = fold(line);
    const run = result.steps["design"]?.[0];
    expect(run).toBeDefined();
    expect("completionReportDiagnostics" in run!.outcome).toBe(false);
  });
});
