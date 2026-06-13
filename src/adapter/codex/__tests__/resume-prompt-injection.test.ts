import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { CodexAgentRunner } from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import { buildAdditionalInstructions, buildResumeSection } from "../../shared/prompt-builder.js";

interface CapturedCall {
  prompt: string;
  opts?: { signal?: AbortSignal; outputSchema?: unknown };
}

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

function makeJobState(jobId = "test-job"): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug" },
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

const baseMessage = "review the request";

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
    buildMessage: () => baseMessage,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

const testCwd = path.join(os.tmpdir(), "codex-resume-prompt-test");

function makeCtx(session: AgentRunContext["session"] = {}): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: testCwd,
    input: { requestContent: "test request", requestAdr: false },
    session,
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

describe("buildResumeSection", () => {
  it("returns an empty string when resumePrompt is undefined", () => {
    expect(buildResumeSection(makeCtx({}))).toBe("");
  });

  it("returns an empty string when resumePrompt is empty", () => {
    expect(buildResumeSection(makeCtx({ resumePrompt: "" }))).toBe("");
  });

  it("wraps resumePrompt in resume-context tags when set", () => {
    expect(buildResumeSection(makeCtx({ resumePrompt: "Human judgment" }))).toBe(
      "\n\n<resume-context>\nHuman judgment\n</resume-context>",
    );
  });
});

describe("CodexAgentRunner resumePrompt injection", () => {
  it("injects resumePrompt into the main turn prompt", async () => {
    const { thread, calls } = makeCapturingMockThread(["approved"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx({ resumePrompt: "Human judgment: accept HIGH finding" }));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toContain("<resume-context>");
    expect(calls[0]!.prompt).toContain("Human judgment: accept HIGH finding");
  });

  it("leaves the main turn prompt byte-identical when resumePrompt is unset", async () => {
    const { thread, calls } = makeCapturingMockThread(["approved"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });
    const ctx = makeCtx({});

    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]!.prompt).toBe(`${baseMessage}\n\n${additionalInstructions}`);
    expect(calls[0]!.prompt).not.toContain("<resume-context>");
  });
});
