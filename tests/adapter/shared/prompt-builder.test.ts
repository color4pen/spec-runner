/**
 * Tests for buildAdditionalInstructions() in prompt-builder.ts
 *
 * TC-PB-01: no branch → returns Agent/Task prohibition only
 * TC-PB-02: with branch → includes runtime instructions + prohibition
 * TC-PB-03: with projectContext → includes project context + prohibition
 * TC-PB-04: Agent/Task prohibition text is always present
 */
import { describe, it, expect } from "vitest";
import { buildAdditionalInstructions } from "../../../src/adapter/shared/prompt-builder.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";

function makeCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
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
      version: 1,
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
    branch: "",
    slug: "test-slug",
    cwd: "/tmp/test",
    input: { requestContent: "test" },
    session: {},
    policy: {},
    config: { version: 1, runtime: "local", agents: {} },
    emit: () => {},
    ...overrides,
  };
}

describe("TC-PB-01: no branch → prohibition only", () => {
  it("returns Agent/Task prohibition when branch is empty", () => {
    const result = buildAdditionalInstructions(makeCtx({ branch: "" }));
    expect(result).toContain("Do not use the Agent or Task tool");
    expect(result).toContain("not available in this environment");
    expect(result).not.toContain("RUNTIME INSTRUCTIONS");
  });
});

describe("TC-PB-02: with branch → runtime instructions + prohibition", () => {
  it("includes runtime instructions and branch info", () => {
    const result = buildAdditionalInstructions(makeCtx({
      branch: "feat/test-slug-abc12345",
      cwd: "/tmp/worktree",
    }));
    expect(result).toContain("RUNTIME INSTRUCTIONS (local Claude Code mode):");
    expect(result).toContain("/tmp/worktree");
    expect(result).toContain("feat/test-slug-abc12345");
    expect(result).toContain("Do not use the Agent or Task tool");
  });

  it("prohibition comes after branch instructions", () => {
    const result = buildAdditionalInstructions(makeCtx({ branch: "feat/test" }));
    const runtimeIdx = result.indexOf("RUNTIME INSTRUCTIONS");
    const prohibitionIdx = result.indexOf("Do not use the Agent or Task tool");
    expect(runtimeIdx).toBeLessThan(prohibitionIdx);
  });
});

describe("TC-PB-03: with projectContext → context + prohibition", () => {
  it("includes project context block and prohibition", () => {
    const result = buildAdditionalInstructions(makeCtx({
      input: { requestContent: "test", projectContext: "# Project\n\nThis is a project." },
    }));
    expect(result).toContain("<project-context>");
    expect(result).toContain("# Project");
    expect(result).toContain("</project-context>");
    expect(result).toContain("Do not use the Agent or Task tool");
  });
});

describe("TC-PB-04: Agent/Task prohibition text", () => {
  it("prohibition is always present regardless of other options", () => {
    const cases = [
      makeCtx(),
      makeCtx({ branch: "feat/test" }),
      makeCtx({ input: { requestContent: "test", projectContext: "context" } }),
      makeCtx({ branch: "feat/test", input: { requestContent: "test", projectContext: "context" } }),
    ];
    for (const ctx of cases) {
      const result = buildAdditionalInstructions(ctx);
      expect(result).toContain("Do not use the Agent or Task tool");
      expect(result).toContain(
        "Complete all tasks yourself using the available tools (Read, Grep, Edit, Bash, Write, Glob) directly.",
      );
    }
  });
});
