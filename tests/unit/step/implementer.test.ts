/**
 * Unit tests for ImplementerStep
 *
 * TC-021: ImplementerStep の構造検証
 * TC-022: ImplementerStep.resultFilePath と parseResult
 * TC-010 (partial): NULL_PARSE_RESULT 共有 (implementer)
 */
import { describe, it, expect, vi } from "vitest";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../../src/prompts/implementer-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    client: {} as StepDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "Do something important", enabled: [] },
    slug,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
    },
  };
}

// TC-021: ImplementerStep の構造検証
describe("TC-021: ImplementerStep 構造検証", () => {
  it("step.kind === 'agent' かつ step.name === 'implementer'", () => {
    expect(ImplementerStep.kind).toBe("agent");
    expect(ImplementerStep.name).toBe("implementer");
  });

  it("step.agent.role === 'implementer' かつ model === 'claude-sonnet-4-5'", () => {
    expect(ImplementerStep.agent.role).toBe("implementer");
    expect(ImplementerStep.agent.model).toBe("claude-sonnet-4-5");
  });

  it("step.agent.capabilities.gitWrite === true", () => {
    expect(ImplementerStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("step.agent.system === IMPLEMENTER_SYSTEM_PROMPT", () => {
    expect(ImplementerStep.agent.system).toBe(IMPLEMENTER_SYSTEM_PROMPT);
  });

  it("step.agent.tools に agent_toolset_20260401 が含まれる (TC-032)", () => {
    const hasToolset = ImplementerStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });
});

// TC-022: ImplementerStep.resultFilePath と parseResult
describe("TC-022: ImplementerStep.resultFilePath と parseResult", () => {
  it("resultFilePath は null を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    expect(ImplementerStep.resultFilePath(state, deps)).toBeNull();
  });

  it("parseResult は NULL_PARSE_RESULT と deep-equal な値を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const result = ImplementerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
    expect(result.fileContent).toBeNull();
  });
});

// buildMessage content (TC-027 area)
describe("ImplementerStep.buildMessage 内容検証", () => {
  it("slug / branch / tasks.md / specs / commit / push / user-request が含まれる", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    const message = ImplementerStep.buildMessage(state, deps);

    expect(message).toContain("openspec/changes/my-change");
    expect(message).toContain("tasks.md");
    expect(message).toContain("specs/");
    expect(message).toContain("feat/my-change");
    // buildGitPushInstruction uses "Commit" (capital) — case-insensitive check
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });
});

// completionVerdict
describe("ImplementerStep.completionVerdict", () => {
  it("completionVerdict === 'success'", () => {
    expect(ImplementerStep.completionVerdict).toBe("success");
  });
});
