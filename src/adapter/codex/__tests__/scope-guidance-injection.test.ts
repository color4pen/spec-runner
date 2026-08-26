/**
 * Spec Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt
 * Spec Requirement: Guidance is positioned after project rules and before the completion report instruction
 * Spec Requirement: Follow-up turns do not repeat the guidance
 *
 * TC-001: guidance appears in a Codex reviewer step prompt
 * TC-002: guidance appears in a Codex producer step prompt
 * TC-003: guidance appears when the step has no report tool
 * TC-004: guidance appears when the session is resumed
 * TC-005: ordering — guidance after project rules, before completion instruction
 * TC-007: completion retry prompt carries no guidance
 * TC-014: guidance present when reportTool is configured but promptRules is absent
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
import { CODEX_SCOPE_GUIDANCE } from "../scope-guidance.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import type { ReportToolSpec, BaseReportResult, FollowUpPolicy } from "../../../core/port/report-result.js";
import { string } from "zod/v4-mini";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock helpers (mirrors prompt-rules-injection.test.ts style)
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedCall {
  prompt: string;
}

function makeCapturingMockThread(responses: string[]): { thread: CodexThread; calls: CapturedCall[] } {
  let callCount = 0;
  const calls: CapturedCall[] = [];
  const thread: CodexThread = {
    id: "mock-thread-id",
    runStreamed: async (prompt: string) => {
      const idx = Math.min(callCount, responses.length - 1);
      const responseText = responses[idx]!;
      callCount++;
      calls.push({ prompt });
      async function* generate() {
        yield { type: "item.completed", item: { type: "agent_message", text: responseText } };
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

// Policy with exactly 1 retry attempt (to keep tests predictable for TC-007)
const singleRetryPolicy: FollowUpPolicy = {
  maxAttempts: 1,
  buildPrompt: () => "retry",
};

const BASE_MESSAGE = "implement this";
const SAMPLE_PROMPT_RULES = "<project-rules>\nrule-content\n</project-rules>";
const RESUME_PROMPT = "resume context content";

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { name: "specrunner-implementer", role: "implementer", model: "gpt-5.5", system: "implement", tools: [] },
    toolHandlers: undefined,
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

let testCwd: string;
beforeAll(async () => {
  testCwd = await fs.mkdtemp(path.join(os.tmpdir(), "codex-scope-guidance-test-"));
});
afterAll(async () => {
  if (testCwd) await fs.rm(testCwd, { recursive: true, force: true });
});

function makeCtx(
  extraPolicy: Partial<AgentRunContext["policy"]> = {},
  session: AgentRunContext["session"] = {},
  stepName = "implementer",
): AgentRunContext {
  return {
    step: makeAgentStep(stepName),
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
// TC-001 / TC-002: Guidance injected for both reviewer and producer step names
// Spec Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-001/TC-002: guidance injected regardless of step name", () => {
  it("TC-001: guidance appears in a reviewer step prompt (custom-reviewer)", async () => {
    // Spec: guidance appears in a Codex reviewer step prompt
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx({}, {}, "custom-reviewer"));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain(CODEX_SCOPE_GUIDANCE);
  });

  it("TC-002: guidance appears in a producer step prompt (implementer)", async () => {
    // Spec: guidance appears in a Codex producer step prompt
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx({}, {}, "implementer"));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain(CODEX_SCOPE_GUIDANCE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: Guidance appears when step has no report tool
// Spec Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-003: guidance appears when step has no report tool", () => {
  it("prompt contains guidance but not COMPLETION_REPORT_MEANS when no reportTool or promptRules", async () => {
    // Spec: guidance appears when the step has no report tool
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    // no reportTool, no promptRules
    await runner.run(makeCtx({}, {}));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain(CODEX_SCOPE_GUIDANCE);
    expect(calls[0]!.prompt).not.toContain(COMPLETION_REPORT_MEANS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: Guidance appears when session is resumed
// Spec Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-004: guidance appears when session is resumed", () => {
  it("prompt contains guidance when resumeSessionId and resumePrompt are set", async () => {
    // Spec: guidance appears when the session is resumed
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(
      makeCtx(
        { reportTool: mockReportTool },
        { resumeSessionId: "prev-session-id", resumePrompt: RESUME_PROMPT },
      ),
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain(RESUME_PROMPT);
    expect(calls[0]!.prompt).toContain(CODEX_SCOPE_GUIDANCE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: Ordering — guidance after project rules, before completion instruction
// Spec Requirement: Guidance is positioned after project rules and before the completion report instruction
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-005: ordering — promptRules < guidance < completion instruction", () => {
  it("guidance appears after promptRules and before completion instruction", async () => {
    // Spec: ordering with project rules and a report tool
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(
      makeCtx(
        { promptRules: SAMPLE_PROMPT_RULES, reportTool: mockReportTool },
        { resumePrompt: RESUME_PROMPT },
      ),
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const prompt = calls[0]!.prompt;

    const rulesIdx = prompt.indexOf(SAMPLE_PROMPT_RULES);
    const guidanceIdx = prompt.indexOf(CODEX_SCOPE_GUIDANCE);
    const completionIdx = prompt.indexOf(buildMainTurnCompletionInstruction());

    expect(rulesIdx).toBeGreaterThanOrEqual(0);
    expect(guidanceIdx).toBeGreaterThan(rulesIdx);
    expect(completionIdx).toBeGreaterThan(guidanceIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: Completion retry prompt carries no guidance
// Spec Requirement: Follow-up turns do not repeat the guidance
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-007: completion retry prompt carries no guidance", () => {
  it("second call (completion retry) does not contain CODEX_SCOPE_GUIDANCE", async () => {
    // Spec: completion retry prompt carries no guidance
    // First call returns non-JSON to trigger retry; second call returns valid JSON
    const { thread, calls } = makeCapturingMockThread([
      "not valid json",
      '{"verdict":"approved"}',
    ]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(
      makeCtx({ reportTool: mockReportTool, toolReportRetry: singleRetryPolicy }, {}),
    );

    // There should be at least 2 calls: main turn + retry turn
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Main turn DOES contain guidance
    expect(calls[0]!.prompt).toContain(CODEX_SCOPE_GUIDANCE);

    // Retry turn does NOT contain guidance
    expect(calls[1]!.prompt).not.toContain(CODEX_SCOPE_GUIDANCE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: Guidance present when reportTool is configured but promptRules is absent
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-014: guidance present with reportTool but no promptRules", () => {
  it("prompt contains guidance before completion instruction when no promptRules", async () => {
    // Spec: guidance is positioned before the completion report instruction
    const { thread, calls } = makeCapturingMockThread(["done"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    // reportTool set, but no promptRules
    await runner.run(makeCtx({ reportTool: mockReportTool }, {}));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const prompt = calls[0]!.prompt;

    expect(prompt).toContain(CODEX_SCOPE_GUIDANCE);
    expect(prompt).toContain(buildMainTurnCompletionInstruction());

    // Guidance must appear before completion instruction
    expect(prompt.indexOf(CODEX_SCOPE_GUIDANCE)).toBeLessThan(
      prompt.indexOf(buildMainTurnCompletionInstruction()),
    );
  });
});
