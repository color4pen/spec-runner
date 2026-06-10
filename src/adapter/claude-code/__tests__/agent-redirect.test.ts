/**
 * Unit tests for Agent/Task tool redirect in ClaudeCodeRunner.
 *
 * TC-ARU-02: redirect message text is present in prompt-builder output
 *
 * TC-ARU-01 (disallowedTools in queryOptions) is covered by
 * agent-redirect-integration.test.ts TC-AR-01 directly.
 *
 * Full integration testing (streaming redirect counter, abort) is in
 * agent-redirect-integration.test.ts (Task 11).
 */
import { describe, it, expect } from "vitest";
import { buildAdditionalInstructions } from "../../shared/prompt-builder.js";
import type { AgentRunContext } from "../../../core/port/agent-runner.js";

function makeMinimalCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    step: {
      kind: "agent",
      name: "test-step",
      agent: { name: "test", role: "implementer", model: "claude-sonnet-4-6", system: "", tools: [] },
      buildMessage: () => "test",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    },
    state: {
      version: 2,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "implementer",
      status: "running",
      branch: null,
      history: [],
      error: null,
    },
    branch: "feat/test",
    slug: "test",
    cwd: "/tmp/test",
    input: { requestContent: "test" },
    session: {},
    policy: {},
    config: { version: 1, runtime: "local", agents: {} },
    emit: () => {},
    ...overrides,
  };
}

describe("TC-ARU-02: redirect message in additionalInstructions", () => {
  it("buildAdditionalInstructions includes Agent/Task prohibition", () => {
    const ctx = makeMinimalCtx();
    const instructions = buildAdditionalInstructions(ctx);
    expect(instructions).toContain("Do not use the Agent or Task tool");
    expect(instructions).toContain("not available in this environment");
  });

  it("Agent/Task prohibition is always present, even without branch", () => {
    const ctx = makeMinimalCtx({ branch: "" });
    const instructions = buildAdditionalInstructions(ctx);
    expect(instructions).toContain("Do not use the Agent or Task tool");
  });

  it("Agent/Task prohibition is present alongside branch instructions", () => {
    const ctx = makeMinimalCtx({ branch: "feat/test-slug" });
    const instructions = buildAdditionalInstructions(ctx);
    // Both branch instructions and Agent prohibition should be present
    expect(instructions).toContain("RUNTIME INSTRUCTIONS");
    expect(instructions).toContain("Do not use the Agent or Task tool");
  });
});
