/**
 * TC-018: codex adapter — promptRules を completion directive の直前に注入する
 *
 * Verifies that ctx.policy.promptRules is injected between baseFullPrompt and
 * buildMainTurnCompletionInstruction() in the codex adapter main work prompt.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  CodexAgentRunner,
  buildMainTurnCompletionInstruction,
  COMPLETION_REPORT_MEANS,
} from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import type { ReportToolSpec, BaseReportResult } from "../../../core/port/report-result.js";
import { string } from "zod/v4-mini";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock helpers (same pattern as resume-prompt-injection.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedCall {
  prompt: string;
}

function makeCapturingMockThread(response = "done"): { thread: CodexThread; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const thread: CodexThread = {
    id: "mock-thread-id",
    runStreamed: async (prompt: string) => {
      calls.push({ prompt });
      async function* generate() {
        yield { type: "item.completed", item: { type: "agent_message", text: response } };
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

function makeJobState(): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug" },
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
  return { version: 1, runtime: "local", agents: {} };
}

interface TestReportResult extends BaseReportResult { verdict: string }
const mockReportTool: ReportToolSpec<TestReportResult> = {
  name: "report_result",
  description: "report",
  zodSchema: { verdict: string() },
  parseInput: (raw) => {
    const obj = raw as Record<string, unknown>;
    if (typeof obj?.["verdict"] === "string") return { ok: true, value: { ok: true, verdict: obj["verdict"] } as TestReportResult };
    return { ok: false, missingFields: ["verdict"], rawInput: raw };
  },
};

const BASE_MESSAGE = "implement this";

function makeAgentStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { name: "specrunner-implementer", role: "implementer", model: "gpt-5.5", system: "implement", tools: [] },
    toolHandlers: undefined,
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

const SAMPLE_PROMPT_RULES = "<project-rules>\nrule-content\n</project-rules>";
const RESUME_PROMPT = "resume context content";

let testCwd: string;
beforeAll(async () => {
  testCwd = await fs.mkdtemp(path.join(os.tmpdir(), "codex-prompt-rules-test-"));
});
afterAll(async () => {
  if (testCwd) await fs.rm(testCwd, { recursive: true, force: true });
});

function makeCtx(extraPolicy: Partial<AgentRunContext["policy"]> = {}, session: AgentRunContext["session"] = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: testCwd,
    input: { requestContent: "test request", requestAdr: false },
    session,
    policy: { ...extraPolicy },
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-018: promptRules が baseFullPrompt の後・completion directive の前に注入される
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-018: codex adapter — promptRules を completion directive の直前に注入する", () => {
  it("promptRules は resume context より後・completion directive より前に現れる", async () => {
    const { thread, calls } = makeCapturingMockThread();
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx(
      { promptRules: SAMPLE_PROMPT_RULES, reportTool: mockReportTool },
      { resumePrompt: RESUME_PROMPT },
    );

    await runner.run(ctx);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const prompt = calls[0]!.prompt;

    const resumeIdx = prompt.indexOf(RESUME_PROMPT);
    const rulesIdx = prompt.indexOf(SAMPLE_PROMPT_RULES);
    const completionIdx = prompt.indexOf(buildMainTurnCompletionInstruction());

    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(resumeIdx);
    expect(completionIdx).toBeGreaterThan(rulesIdx);
  });

  it("promptRules 未設定のとき prompt に <project-rules> が含まれない", async () => {
    const { thread, calls } = makeCapturingMockThread();
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx({ reportTool: mockReportTool });
    await runner.run(ctx);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).not.toContain("<project-rules>");
    expect(calls[0]!.prompt).toContain(COMPLETION_REPORT_MEANS);
  });
});
