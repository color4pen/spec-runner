/**
 * T-04: Unit tests for tryExtractToolResult
 * T-05: Integration tests for CodexAgentRunner.run() completion report extraction
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { tryExtractToolResult, CodexAgentRunner } from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import type { ReportToolSpec, BaseReportResult } from "../../../core/port/report-result.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import { string } from "zod/v4-mini";

// ---------------------------------------------------------------------------
// Shared fixture: minimal reportTool stub with verdict field
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

const VALID_JSON = JSON.stringify({ verdict: "approve" });
const INVALID_SCHEMA_JSON = JSON.stringify({ unexpected: "field" });

// ---------------------------------------------------------------------------
// T-04: Unit tests for tryExtractToolResult
// ---------------------------------------------------------------------------

describe("tryExtractToolResult — unit tests", () => {
  describe("Strategy 1: raw parse", () => {
    it("raw JSON finalResponse → toolResult non-null, failureReason null", () => {
      const result = tryExtractToolResult(VALID_JSON, mockReportTool);
      expect(result.toolResult).not.toBeNull();
      expect(result.failureReason).toBeNull();
      expect(result.rawFragment).toBeNull();
      expect((result.toolResult as TestReportResult).verdict).toBe("approve");
    });

    it("raw JSON with surrounding whitespace → toolResult non-null", () => {
      const result = tryExtractToolResult(`  ${VALID_JSON}  `, mockReportTool);
      expect(result.toolResult).not.toBeNull();
    });
  });

  describe("Strategy 2: code-fence extraction", () => {
    it("```json\\n{...}\\n``` finalResponse → toolResult non-null", () => {
      const finalResponse = "```json\n" + VALID_JSON + "\n```";
      const result = tryExtractToolResult(finalResponse, mockReportTool);
      expect(result.toolResult).not.toBeNull();
      expect((result.toolResult as TestReportResult).verdict).toBe("approve");
    });

    it("```\\n{...}\\n``` (no language tag) → toolResult non-null", () => {
      const finalResponse = "```\n" + VALID_JSON + "\n```";
      const result = tryExtractToolResult(finalResponse, mockReportTool);
      expect(result.toolResult).not.toBeNull();
    });

    it("inline code fence ```json {...} ``` → toolResult non-null", () => {
      const finalResponse = "```json " + VALID_JSON + " ```";
      const result = tryExtractToolResult(finalResponse, mockReportTool);
      expect(result.toolResult).not.toBeNull();
    });
  });

  describe("Strategy 3: bracket extraction", () => {
    it("explanation text prefix + JSON → toolResult non-null", () => {
      const finalResponse = "Explanation text\n" + VALID_JSON;
      const result = tryExtractToolResult(finalResponse, mockReportTool);
      expect(result.toolResult).not.toBeNull();
      expect((result.toolResult as TestReportResult).verdict).toBe("approve");
    });

    it("JSON + trailing text → toolResult non-null", () => {
      const finalResponse = VALID_JSON + "\nsome trailing text";
      const result = tryExtractToolResult(finalResponse, mockReportTool);
      expect(result.toolResult).not.toBeNull();
    });
  });

  describe("Failure cases", () => {
    it("schema-invalid JSON → toolResult null, failureReason: validation-failed", () => {
      const result = tryExtractToolResult(INVALID_SCHEMA_JSON, mockReportTool);
      expect(result.toolResult).toBeNull();
      expect(result.failureReason).toBe("validation-failed");
    });

    it("non-JSON prose → toolResult null, failureReason: no-json-found, rawFragment ≤200 chars", () => {
      const prose = "This is plain text with no JSON at all.";
      const result = tryExtractToolResult(prose, mockReportTool);
      expect(result.toolResult).toBeNull();
      expect(result.failureReason).toBe("no-json-found");
      expect(result.rawFragment).not.toBeNull();
      expect(result.rawFragment!.length).toBeLessThanOrEqual(200);
    });

    it("finalResponse longer than 200 chars, unrecoverable → rawFragment ends with … and ≤201 chars", () => {
      const longProse = "x".repeat(300);
      const result = tryExtractToolResult(longProse, mockReportTool);
      expect(result.toolResult).toBeNull();
      expect(result.rawFragment).not.toBeNull();
      expect(result.rawFragment!.endsWith("…")).toBe(true);
      expect(result.rawFragment!.length).toBeLessThanOrEqual(201);
    });
  });

  describe("Removed API", () => {
    it("tryParseToolResult is not exported from agent-runner", async () => {
      const mod = await import("../agent-runner.js");
      expect("tryParseToolResult" in mod).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// T-05: Integration tests for CodexAgentRunner.run()
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/** Build a minimal CodexThread that returns the given responses on sequential runStreamed calls. */
function makeMockThread(responses: string[]): CodexThread {
  let callCount = 0;

  return {
    id: "mock-thread-id",
    runStreamed: async (_prompt: string, _opts?: unknown) => {
      const idx = Math.min(callCount, responses.length - 1);
      const responseText = responses[idx]!;
      callCount++;

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
}

/** Build a minimal CodexInstance that always starts the given thread. */
function makeMockCodexInstance(thread: CodexThread): CodexInstance {
  return {
    startThread: (_opts) => thread,
    resumeThread: (_threadId) => thread,
  };
}

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
    // _codexFactory is injected via CodexAgentRunnerDeps, not on ctx
  } as AgentRunContext;
}

describe("T-05: Integration — CodexAgentRunner.run() completion report extraction", () => {
  it("all turns return unrecoverable finalResponse → toolResult null, completionReason success", async () => {
    const unrecoverable = "This is just prose, no JSON here at all.";
    // main turn + 2 retry turns (DEFAULT_TOOL_RETRY.maxAttempts = 2) all return prose
    const thread = makeMockThread([unrecoverable, unrecoverable, unrecoverable]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    expect(result.completionReason).toBe("success");
    expect(result.toolResult).toBeNull();
  });

  it("main turn returns code-fenced JSON → toolResult non-null, no retry turns", async () => {
    const codeFenced = "```json\n" + VALID_JSON + "\n```";
    // only 1 response needed (main turn)
    const thread = makeMockThread([codeFenced]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    expect(result.completionReason).toBe("success");
    expect(result.toolResult).not.toBeNull();
    expect(result.followUpAttempts).toBe(0);
  });

  it("main turn unrecoverable, first retry returns code-fenced JSON → toolResult non-null, followUpAttempts=1", async () => {
    const unrecoverable = "Sorry, no JSON here.";
    const codeFenced = "```json\n" + VALID_JSON + "\n```";
    // main: unrecoverable, retry 1: code-fenced (success), retry 2: not reached
    const thread = makeMockThread([unrecoverable, codeFenced]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const result = await runner.run(makeCtx(thread));

    expect(result.completionReason).toBe("success");
    expect(result.toolResult).not.toBeNull();
    expect(result.followUpAttempts).toBe(1);
  });
});
