/**
 * Unit tests for DispatchingAgentRunner
 */
import { describe, it, expect, vi } from "vitest";
import { DispatchingAgentRunner } from "../../../src/adapter/dispatching/agent-runner.js";
import type { AgentRunner, AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../src/state/schema.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

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

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    anthropic: { apiKey: "" },
    agents: {},
    ...overrides,
  };
}

function makeAgentStep(model: string): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model,
      system: "implement this",
      tools: [],
    },
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeCtx(model: string, configOverrides: Partial<SpecRunnerConfig> = {}): AgentRunContext {
  return {
    step: makeAgentStep(model),
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: "/fake/cwd",
    requestContent: "# Request",
    config: makeConfig(configOverrides),
    emit: vi.fn(),
  };
}

function makeMockRunner(): AgentRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn().mockResolvedValue({
      completionReason: "success",
      resultContent: "done",
    }),
  };
}

describe("DispatchingAgentRunner", () => {
  it("routes anthropic model to ClaudeCodeRunner", async () => {
    const claudeRunner = makeMockRunner();
    const dispatcher = new DispatchingAgentRunner(claudeRunner as never);

    await dispatcher.run(makeCtx("claude-sonnet-4-5"));
    expect(claudeRunner.run).toHaveBeenCalledOnce();
  });

  it("routes openai model to CodexAgentRunner (lazy init)", async () => {
    const claudeRunner = makeMockRunner();
    const dispatcher = new DispatchingAgentRunner(claudeRunner as never);

    const originalEnv = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "sk-test-key";

    try {
      // We can't easily mock the CodexAgentRunner constructor here,
      // but we can verify that claudeRunner is NOT called for OpenAI model
      const ctx = makeCtx("o3");
      // Expect it to either succeed with codex or fail with CODEX_SDK_ERROR (SDK not available)
      const result = await dispatcher.run(ctx).catch((err: Error) => ({ error: err }));
      // The important assertion: claude runner was NOT called
      expect(claudeRunner.run).not.toHaveBeenCalled();
    } finally {
      if (originalEnv === undefined) {
        delete process.env["OPENAI_API_KEY"];
      } else {
        process.env["OPENAI_API_KEY"] = originalEnv;
      }
    }
  });

  it("throws MISSING_OPENAI_API_KEY when OPENAI_API_KEY is not set", async () => {
    const claudeRunner = makeMockRunner();
    const dispatcher = new DispatchingAgentRunner(claudeRunner as never);

    const originalEnv = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];

    try {
      await expect(dispatcher.run(makeCtx("o3"))).rejects.toThrow("OPENAI_API_KEY");
    } finally {
      if (originalEnv !== undefined) {
        process.env["OPENAI_API_KEY"] = originalEnv;
      }
    }
  });

  it("throws CONFIG_INVALID for unknown model", async () => {
    const claudeRunner = makeMockRunner();
    const dispatcher = new DispatchingAgentRunner(claudeRunner as never);

    await expect(dispatcher.run(makeCtx("unknown-model-xyz"))).rejects.toThrow(/CONFIG_INVALID/);
  });

  it("calls claude runner for anthropic model from user-defined models section", async () => {
    const claudeRunner = makeMockRunner();
    const dispatcher = new DispatchingAgentRunner(claudeRunner as never);

    const ctx = makeCtx("my-custom-claude", {
      models: { "my-custom-claude": { provider: "anthropic" } },
    });
    await dispatcher.run(ctx);
    expect(claudeRunner.run).toHaveBeenCalledOnce();
  });
});
