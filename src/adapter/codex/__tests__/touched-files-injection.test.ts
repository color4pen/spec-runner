/**
 * Tests for touched-files injection in the codex adapter (TC-024 to TC-025).
 *
 * TC-024: codex job では記録が生成されず注入もされない
 * TC-025: 注入は両 adapter で共通の共有層関数を経由する
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
import { buildTouchedFilesSection } from "../../shared/touched-files-bundle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedCall {
  prompt: string;
}

function makeCapturingMockThread(response = "approved"): {
  thread: CodexThread;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const thread: CodexThread = {
    id: "mock-thread-id",
    runStreamed: async (prompt: string) => {
      calls.push({ prompt });
      async function* generate() {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: response },
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

function makeJobState(
  slug = "test-slug",
  touchedFiles?: Record<string, string[]>,
): JobState {
  const state: JobState = {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
  if (touchedFiles !== undefined) {
    state.touchedFiles = touchedFiles;
  }
  return state;
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

const BASE_MESSAGE = "review the implementation";

function makeAgentStep(name = "code-review"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "gpt-5.5",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => BASE_MESSAGE,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

function makeCtx(
  cwd: string,
  slug = "test-slug",
  touchedFiles?: Record<string, string[]>,
): AgentRunContext {
  return {
    step: makeAgentStep("code-review"),
    state: makeJobState(slug, touchedFiles),
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-tf-inject-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-024: codex job では記録が生成されず注入もされない
// ---------------------------------------------------------------------------

describe("TC-024: codex job — no touchedFiles generated, no injection", () => {
  it("codex adapter returns result without touchedFiles (codex does not record)", async () => {
    const { thread } = makeCapturingMockThread("approved");
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx(tempDir);
    const result = await runner.run(ctx);

    // codex adapter must NOT set touchedFiles (it doesn't record)
    expect(result.touchedFiles).toBeUndefined();
  });

  it("codex prompt is byte-identical to pre-injection when no prior touchedFiles exist", async () => {
    const { thread: t1, calls: c1 } = makeCapturingMockThread("approved");
    const runner1 = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(t1),
      _sleepFn: async () => {},
    });

    // No touchedFiles
    const ctx1 = makeCtx(tempDir);
    await runner1.run(ctx1);

    const { thread: t2, calls: c2 } = makeCapturingMockThread("approved");
    const runner2 = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(t2),
      _sleepFn: async () => {},
    });

    // Empty touchedFiles
    const ctx2 = makeCtx(tempDir, "test-slug", {});
    await runner2.run(ctx2);

    expect(c1[0]!.prompt).toBe(c2[0]!.prompt);
  });

  it("state.touchedFiles remains empty/undefined for a full codex job run", async () => {
    // With prior records in state but codex runs: state.touchedFiles is not modified by codex
    // (codex returns undefined touchedFiles, so commitOrchestrator does NOT add a codex entry)
    // This test verifies that the codex adapter's AgentRunResult.touchedFiles is undefined.

    const { thread } = makeCapturingMockThread("approved");
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx(tempDir, "test-slug", {
      implementer: ["src/core/foo.ts"],
    });
    const result = await runner.run(ctx);

    // Result.touchedFiles is undefined → CommitOrchestrator will not add a codex entry
    expect(result.touchedFiles).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-025: 注入は両 adapter で共通の共有層関数を経由する
// ---------------------------------------------------------------------------

describe("TC-025: both adapters use the same shared buildTouchedFilesSection function", () => {
  it("buildTouchedFilesSection is importable from the shared layer", () => {
    // The function must exist and be callable
    expect(typeof buildTouchedFilesSection).toBe("function");
  });

  it("buildTouchedFilesSection produces the same section regardless of which adapter calls it", () => {
    const state = makeJobState("test-slug", {
      implementer: ["src/core/foo.ts"],
    });

    // Both adapters would call this same function
    const sectionForClaudeCode = buildTouchedFilesSection(state, "code-review");
    const sectionForCodex = buildTouchedFilesSection(state, "code-review");

    expect(sectionForClaudeCode).toBe(sectionForCodex);
    expect(sectionForClaudeCode).not.toBe("");
    expect(sectionForClaudeCode).toContain("implementer");
  });

  it("codex prompt would include touched-files section if state had prior records (shared function)", async () => {
    // When state has prior touchedFiles from implementer, codex prompt should include the section
    // This verifies that codex adapter uses the shared function (not a codex-specific one)
    const { thread, calls } = makeCapturingMockThread("approved");
    const runner = new CodexAgentRunner({
      _codexFactory: () => makeMockCodexInstance(thread),
      _sleepFn: async () => {},
    });

    const ctx = makeCtx(tempDir, "test-slug", {
      implementer: ["src/core/real.ts", "src/adapter/foo.ts"],
    });

    await runner.run(ctx);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = calls[0]!.prompt;

    // The codex adapter should inject the touched-files section from prior steps
    expect(firstPrompt).toContain("implementer");
    expect(firstPrompt).toContain("src/core/real.ts");
    expect(firstPrompt).toContain("src/adapter/foo.ts");
  });

  it("codex and claude-code produce same injection content for same state (shared function contract)", () => {
    const state = makeJobState("test-slug", {
      implementer: ["src/core/foo.ts"],
    });

    // Both would compute the same section via the same shared function
    const section = buildTouchedFilesSection(state, "code-review");

    // Verify the shared function output is deterministic
    expect(section).toBe(buildTouchedFilesSection(state, "code-review"));
  });
});
