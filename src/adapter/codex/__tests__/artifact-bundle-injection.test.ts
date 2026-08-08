/**
 * Integration tests verifying that buildArtifactBundle output reaches the codex thread prompt.
 *
 * TC-012: codex adapter prompt includes bundled-change-artifacts when design.md exists
 * TC-015: when no artifacts exist the codex baseFullPrompt is byte-identical to pre-injection
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CodexAgentRunner } from "../agent-runner.js";
import type { CodexInstance, CodexThread } from "../agent-runner.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";
import type { AgentStep } from "../../../core/step/types.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState } from "../../../state/schema.js";
import { buildAdditionalInstructions } from "../../shared/prompt-builder.js";

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

function makeJobState(slug = "test-slug"): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug },
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

const BASE_MESSAGE = "review the request";

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
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(cwd: string, slug = "test-slug"): AgentRunContext {
  return {
    step: makeAgentStep(),
    state: makeJobState(slug),
    branch: "feat/test",
    slug,
    cwd,
    input: { requestContent: "test request", requestAdr: false },
    session: {},
    policy: {},
    requestType: "bug-fix",
    config: makeConfig(),
    emit: () => {},
  } as AgentRunContext;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-artifact-inject-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: codex adapter prompt includes bundled-change-artifacts
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012: codex adapter — prompt includes bundled-change-artifacts when design.md exists", () => {
  it("main turn prompt contains bundled-change-artifacts tag, path header, and file content", async () => {
    const slug = "test-slug";
    const changeDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "design.md"), "DESIGN_CONTENT");

    const { thread, calls } = makeCapturingMockThread(["approved"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    await runner.run(makeCtx(tempDir, slug));

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = calls[0]!.prompt;
    expect(firstPrompt).toContain("<bundled-change-artifacts>");
    expect(firstPrompt).toContain(`specrunner/changes/${slug}/design.md`);
    expect(firstPrompt).toContain("DESIGN_CONTENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: when no artifacts exist, codex baseFullPrompt is byte-identical to pre-injection
// Note: the existing resume-prompt-injection.test.ts "byte-identical" case also covers TC-015.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: codex — no artifacts → baseFullPrompt is byte-identical to pre-injection formula", () => {
  it("prompt equals baseMessage + additionalInstructions when change folder is absent", async () => {
    // tempDir has no specrunner/changes/<slug>/ → buildArtifactBundle returns ""
    const { thread, calls } = makeCapturingMockThread(["approved"]);
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx(tempDir);
    await runner.run(ctx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // No reportTool → fullPrompt == baseFullPrompt; no artifacts → artifactSection == ""
    expect(calls[0]!.prompt).toBe(`${BASE_MESSAGE}\n\n${additionalInstructions}`);
    expect(calls[0]!.prompt).not.toContain("<bundled-change-artifacts>");
  });
});
